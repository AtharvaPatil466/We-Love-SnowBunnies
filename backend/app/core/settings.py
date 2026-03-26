from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FraudSense API"
    app_version: str = "0.2.0"
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    auth_secret_key: str = Field(default="fraudsense-dev-secret", alias="AUTH_SECRET_KEY")
    auth_token_ttl_minutes: int = Field(default=720, alias="AUTH_TOKEN_TTL_MINUTES")
    auth_users_path: str = Field(default="data/auth_users.json", alias="AUTH_USERS_PATH")
    model_checkpoint_path: str | None = Field(default=None, alias="MODEL_CHECKPOINT_PATH")
    graph_focus_user_id: str = Field(default="user_01", alias="GRAPH_FOCUS_USER_ID")
    high_risk_threshold: float = Field(default=0.8, alias="HIGH_RISK_THRESHOLD")
    medium_risk_threshold: float = Field(default=0.45, alias="MEDIUM_RISK_THRESHOLD")
    neo4j_uri: str | None = Field(default=None, alias="NEO4J_URI")
    neo4j_username: str | None = Field(default=None, alias="NEO4J_USERNAME")
    neo4j_password: str | None = Field(default=None, alias="NEO4J_PASSWORD")
    expo_push_url: str = Field(default="https://exp.host/--/api/v2/push/send", alias="EXPO_PUSH_URL")
    expo_push_access_token: str | None = Field(default=None, alias="EXPO_PUSH_ACCESS_TOKEN")
    expo_push_dry_run: bool = Field(default=True, alias="EXPO_PUSH_DRY_RUN")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def resolved_checkpoint_path(self) -> Path | None:
        if not self.model_checkpoint_path:
            return None
        return Path(self.model_checkpoint_path).expanduser().resolve()

    @property
    def resolved_auth_users_path(self) -> Path:
        path = Path(self.auth_users_path).expanduser()
        if path.is_absolute():
            return path.resolve()
        return (Path(__file__).resolve().parents[2] / path).resolve()

    @property
    def neo4j_enabled(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_username and self.neo4j_password)

    @property
    def expo_push_enabled(self) -> bool:
        return bool(self.expo_push_url)


settings = Settings()
