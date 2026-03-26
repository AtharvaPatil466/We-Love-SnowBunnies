from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import sys

from app.core.settings import settings
from app.schemas import PredictionResponse, SenderProfile, TransactionPayload

ML_PACKAGE_PATH = Path(__file__).resolve().parents[3] / "ml"
if ML_PACKAGE_PATH.exists():
    sys.path.append(str(ML_PACKAGE_PATH))

def sigmoid_score(logit: float) -> float:
    return float(1.0 / (1.0 + math.exp(-logit)))


@dataclass
class FraudScore:
    probability: float
    label: str
    factors: list[str]


class FraudModelService:
    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        self.model_source = "heuristic"
        self.checkpoint_path = settings.resolved_checkpoint_path
        self.feature_mean: list[float] | None = None
        self.feature_std: list[float] | None = None
        self.feature_names: list[str] = []
        self._load_checkpoint_if_available()

    def predict(self, payload: TransactionPayload, sender_profile: SenderProfile) -> PredictionResponse:
        score = self._score(payload, sender_profile)
        return PredictionResponse(
            transaction_id=payload.transaction_id,
            fraud_probability=round(score.probability, 4),
            risk_label=score.label,
            contributing_factors=score.factors,
        )

    def _load_checkpoint_if_available(self) -> None:
        if self.checkpoint_path is None or not self.checkpoint_path.exists():
            return
        try:
            from src.inference import load_runtime_scorer
            model, feature_mean, feature_std, feature_names = load_runtime_scorer(self.checkpoint_path)
        except Exception:
            return
        self.model = model
        self.feature_mean = feature_mean.tolist() if hasattr(feature_mean, "tolist") else list(feature_mean)
        self.feature_std = feature_std.tolist() if hasattr(feature_std, "tolist") else list(feature_std)
        self.feature_std = [value if value != 0 else 1.0 for value in self.feature_std]
        self.feature_names = feature_names
        self.model_source = "checkpoint"

    def _score(self, payload: TransactionPayload, sender_profile: SenderProfile) -> FraudScore:
        heuristic = self._heuristic_score(payload, sender_profile.transaction_count)
        if self.model is None or self.feature_mean is None or self.feature_std is None:
            return heuristic

        checkpoint_probability = self._checkpoint_probability(sender_profile)
        blended_probability = float((checkpoint_probability * 0.7) + (heuristic.probability * 0.3))
        label = self._label_for_probability(blended_probability)
        factors = [
            f"Checkpoint-backed score from {Path(self.checkpoint_path).name}",
            f"Sender profile: {sender_profile.transaction_count} txns, {sender_profile.unique_counterparties} counterparties",
        ]
        factors.extend(heuristic.factors[:2])
        return FraudScore(probability=blended_probability, label=label, factors=factors)

    def _checkpoint_probability(self, sender_profile: SenderProfile) -> float:
        features = [
            float(sender_profile.transaction_count),
            float(sender_profile.avg_amount),
            float(sender_profile.unique_counterparties),
            float(sender_profile.device_diversity),
        ]
        normalized = [
            (value - mean) / std
            for value, mean, std in zip(features, self.feature_mean, self.feature_std, strict=False)
        ]
        if len(normalized) < len(features):
            normalized.extend(features[len(normalized):])
        model_input = None
        try:
            import torch  # type: ignore
        except ImportError:  # pragma: no cover
            return 0.0
        model_input = torch.tensor(normalized, dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            logit = self.model(model_input).item()
        return sigmoid_score(logit)

    def _label_for_probability(self, probability: float) -> str:
        if probability >= settings.high_risk_threshold:
            return "high"
        if probability >= settings.medium_risk_threshold:
            return "medium"
        return "low"

    def _heuristic_score(self, payload: TransactionPayload, sender_history_size: int) -> FraudScore:
        risk = 0.08
        factors: list[str] = []

        if payload.amount >= 5000:
            risk += 0.25
            factors.append("High transaction amount")
        if payload.product_type.upper() == "UPI":
            risk += 0.08
            factors.append("UPI rail monitored for instant fraud bursts")
        if sender_history_size >= 4:
            risk += min(sender_history_size * 0.04, 0.2)
            factors.append("Unusual transaction velocity")
        if payload.email_domain and payload.email_domain.endswith((".ru", ".xyz", ".top")):
            risk += 0.15
            factors.append("Suspicious email domain pattern")
        if payload.location and payload.location.lower() in {"unknown", "proxy", "vpn"}:
            risk += 0.12
            factors.append("Location mismatch or masked origin")
        if sender_history_size >= 2 and payload.amount >= 3000:
            risk += 0.1
            factors.append("Dense graph neighborhood around sender")

        probability = float(1.0 / (1.0 + math.exp(-((risk - 0.5) * 4))))
        if probability >= settings.high_risk_threshold:
            label = "high"
        elif probability >= settings.medium_risk_threshold:
            label = "medium"
        else:
            label = "low"

        if not factors:
            factors.append("No major anomaly beyond baseline network risk")

        return FraudScore(probability=probability, label=label, factors=factors)
