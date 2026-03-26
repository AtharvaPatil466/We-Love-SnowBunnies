from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException

from app.core.settings import settings
from app.schemas import AuthLoginPayload, AuthRegisterPayload, AuthTokenResponse, AuthUsersResponse, UserProfile


@dataclass
class StoredUser:
    user_id: str
    username: str
    display_name: str
    role: Literal["analyst", "customer"]
    linked_user_id: str
    password_salt: str
    password_hash: str


class AuthService:
    def __init__(self) -> None:
        self._users_path = settings.resolved_auth_users_path
        self._users_path.parent.mkdir(parents=True, exist_ok=True)
        self._users: list[StoredUser] = self._load_or_seed_users()

    def list_users(self) -> AuthUsersResponse:
        return AuthUsersResponse(users=[self._to_profile(user) for user in self._users])

    def login(self, payload: AuthLoginPayload) -> AuthTokenResponse:
        user = self._get_user_by_username(payload.username)
        if user is None or not self._verify_password(payload.password, user.password_salt, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return self._build_login_response(user)

    def register(self, payload: AuthRegisterPayload) -> AuthTokenResponse:
        if self._get_user_by_username(payload.username) is not None:
            raise HTTPException(status_code=409, detail="Username already exists")

        linked_user_id = payload.linked_user_id or f"user_{payload.username}"
        salt, password_hash = self._hash_password(payload.password)
        user = StoredUser(
            user_id=f"user_{uuid4().hex[:10]}",
            username=payload.username,
            display_name=payload.display_name,
            role="customer",
            linked_user_id=linked_user_id,
            password_salt=salt,
            password_hash=password_hash,
        )
        self._users.append(user)
        self._save_users()
        return self._build_login_response(user)

    def resolve_token(self, token: str) -> UserProfile:
        try:
            header_segment, payload_segment, signature_segment = token.split(".")
            signed_value = f"{header_segment}.{payload_segment}".encode("utf-8")
            expected_signature = self._sign(signed_value)
            if not hmac.compare_digest(signature_segment, expected_signature):
                raise ValueError("Bad signature")
            payload = json.loads(self._decode_segment(payload_segment))
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

        expires_at = datetime.fromisoformat(payload["exp"])
        if expires_at < datetime.now(UTC):
            raise HTTPException(status_code=401, detail="Authentication token expired")

        user = self._get_user_by_id(payload["sub"])
        if user is None:
            raise HTTPException(status_code=401, detail="Authenticated user no longer exists")
        return self._to_profile(user)

    def ensure_user_access(self, user: UserProfile, requested_user_id: str) -> None:
        if user.role == "analyst":
            return
        if user.linked_user_id != requested_user_id:
            raise HTTPException(status_code=403, detail="Customers can only access their own linked account")

    def ensure_analyst(self, user: UserProfile) -> None:
        if user.role != "analyst":
            raise HTTPException(status_code=403, detail="Analyst role required")

    def _build_login_response(self, user: StoredUser) -> AuthTokenResponse:
        return AuthTokenResponse(
            success=True,
            access_token=self._issue_token(user),
            user=self._to_profile(user),
        )

    def _issue_token(self, user: StoredUser) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "sub": user.user_id,
            "username": user.username,
            "role": user.role,
            "linked_user_id": user.linked_user_id,
            "exp": (datetime.now(UTC) + timedelta(minutes=settings.auth_token_ttl_minutes)).isoformat(),
        }
        encoded_header = self._encode_segment(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        encoded_payload = self._encode_segment(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signed_value = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        signature = self._sign(signed_value)
        return f"{encoded_header}.{encoded_payload}.{signature}"

    def _sign(self, data: bytes) -> str:
        return self._encode_segment(hmac.new(settings.auth_secret_key.encode("utf-8"), data, hashlib.sha256).digest())

    def _encode_segment(self, value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")

    def _decode_segment(self, value: str) -> str:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(f"{value}{padding}").decode("utf-8")

    def _hash_password(self, password: str, salt: str | None = None) -> tuple[str, str]:
        actual_salt = salt or secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            actual_salt.encode("utf-8"),
            120_000,
        ).hex()
        return actual_salt, password_hash

    def _verify_password(self, password: str, salt: str, password_hash: str) -> bool:
        _, candidate = self._hash_password(password, salt=salt)
        return hmac.compare_digest(candidate, password_hash)

    def _to_profile(self, user: StoredUser) -> UserProfile:
        return UserProfile(
            user_id=user.user_id,
            username=user.username,
            display_name=user.display_name,
            role=user.role,
            linked_user_id=user.linked_user_id,
        )

    def _load_or_seed_users(self) -> list[StoredUser]:
        if self._users_path.exists():
            payload = json.loads(self._users_path.read_text(encoding="utf-8"))
            return [StoredUser(**entry) for entry in payload]

        seeded = [
            self._make_seed_user("asha", "Asha Patel", "analyst", "user_01", "asha@1234"),
            self._make_seed_user("rahul", "Rahul Mehta", "analyst", "user_01", "rahul@1234"),
            self._make_seed_user("ria", "Ria Sharma", "customer", "user_01", "ria@1234"),
        ]
        self._users = seeded
        self._save_users()
        return seeded

    def _make_seed_user(
        self,
        username: str,
        display_name: str,
        role: Literal["analyst", "customer"],
        linked_user_id: str,
        password: str,
    ) -> StoredUser:
        salt, password_hash = self._hash_password(password)
        return StoredUser(
            user_id=f"user_{uuid4().hex[:10]}",
            username=username,
            display_name=display_name,
            role=role,
            linked_user_id=linked_user_id,
            password_salt=salt,
            password_hash=password_hash,
        )

    def _save_users(self) -> None:
        payload = [asdict(user) for user in self._users]
        self._users_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _get_user_by_username(self, username: str) -> StoredUser | None:
        return next((user for user in self._users if user.username == username), None)

    def _get_user_by_id(self, user_id: str) -> StoredUser | None:
        return next((user for user in self._users if user.user_id == user_id), None)
