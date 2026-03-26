from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from urllib.error import URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from app.core.settings import settings
from app.schemas import AlertPayload, AlertRecord, AlertResponse, AlertsResponse, DeviceRegistrationPayload, DeviceRegistrationResponse, PredictionResponse

logger = logging.getLogger("fraudsense.alerts")


class AlertService:
    def __init__(self) -> None:
        self._alerts: list[AlertRecord] = []
        self._device_tokens: dict[str, dict[str, str]] = {}

    def register_device(self, payload: DeviceRegistrationPayload) -> DeviceRegistrationResponse:
        user_devices = self._device_tokens.setdefault(payload.user_id, {})
        user_devices[payload.expo_push_token] = payload.platform
        return DeviceRegistrationResponse(
            registered=True,
            user_id=payload.user_id,
            channel="expo-push",
            message=f"Registered {payload.platform} device for {payload.user_id}",
        )

    def send(self, payload: AlertPayload) -> AlertResponse:
        if payload.fraud_probability < settings.medium_risk_threshold:
            return AlertResponse(
                delivered=False,
                channel="in-app",
                message=f"Risk below alert threshold for {payload.user_id}",
            )

        tokens = list(self._device_tokens.get(payload.user_id, {}).keys())
        if not tokens:
            return AlertResponse(
                delivered=True,
                channel="in-app",
                message=f"No registered push devices for {payload.user_id}; alert stored in inbox",
            )

        if settings.expo_push_dry_run:
            return AlertResponse(
                delivered=True,
                channel="expo-push",
                message=f"Expo push dry run queued for {payload.user_id} on {len(tokens)} device(s)",
            )

        delivered = self._dispatch_expo_push(tokens, payload)
        return AlertResponse(
            delivered=delivered,
            channel="expo-push",
            message=(
                f"Expo push sent to {len(tokens)} device(s) for {payload.user_id}"
                if delivered
                else f"Expo push delivery failed for {payload.user_id}; alert kept in inbox"
            ),
        )

    def create_from_prediction(self, user_id: str, prediction: PredictionResponse) -> AlertRecord | None:
        if prediction.risk_label == "low":
            return None

        linked_rings = ", ".join(prediction.linked_ring_ids) if prediction.linked_ring_ids else "standalone anomaly"
        payload = AlertPayload(
            user_id=user_id,
            transaction_id=prediction.transaction_id,
            fraud_probability=prediction.fraud_probability,
            message=f"High risk transaction detected. Linked pattern: {linked_rings}.",
        )
        delivery = self.send(payload)
        record = AlertRecord(
            alert_id=f"alert_{uuid4().hex[:10]}",
            user_id=user_id,
            transaction_id=prediction.transaction_id,
            fraud_probability=prediction.fraud_probability,
            risk_label=prediction.risk_label,
            message=payload.message,
            created_at=datetime.now(UTC).isoformat(),
            delivered=delivery.delivered,
            channel=delivery.channel,
        )
        self._alerts.insert(0, record)
        self._alerts = self._alerts[:25]
        return record

    def list_for_user(self, user_id: str) -> AlertsResponse:
        alerts = [alert for alert in self._alerts if alert.user_id == user_id]
        return AlertsResponse(user_id=user_id, alerts=alerts)

    def _dispatch_expo_push(self, tokens: list[str], payload: AlertPayload) -> bool:
        message_batch = [
            {
                "to": token,
                "title": "FraudSense warning",
                "body": payload.message,
                "sound": "default",
                "data": {
                    "transaction_id": payload.transaction_id,
                    "fraud_probability": payload.fraud_probability,
                    "user_id": payload.user_id,
                },
            }
            for token in tokens
        ]
        body = json.dumps(message_batch).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if settings.expo_push_access_token:
            headers["Authorization"] = f"Bearer {settings.expo_push_access_token}"
        request = Request(settings.expo_push_url, data=body, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=10) as response:
                status_code = getattr(response, "status", response.getcode())
                delivered = 200 <= status_code < 300
                if not delivered:
                    logger.warning("Expo push API returned non-success status %s for %s", status_code, payload.user_id)
                return delivered
        except URLError:
            logger.exception("Expo push delivery failed for %s", payload.user_id)
            return False
