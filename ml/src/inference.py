from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import torch
    from src.models import GATFraudDetector, NodeRiskMLP


def load_model(checkpoint_path: str | Path) -> "GATFraudDetector":
    import torch
    from src.models import GATFraudDetector

    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model = GATFraudDetector(
        in_channels=checkpoint["in_channels"],
        hidden_channels=checkpoint["hidden_channels"],
    )
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return model


def load_runtime_scorer(checkpoint_path: str | Path) -> tuple["NodeRiskMLP", "torch.Tensor", "torch.Tensor", list[str]]:
    import torch
    from src.models import NodeRiskMLP

    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    if "mlp_state_dict" not in checkpoint:
        raise ValueError("Checkpoint does not contain runtime scorer weights")
    model = NodeRiskMLP(
        in_channels=checkpoint["in_channels"],
        hidden_channels=checkpoint.get("mlp_hidden_channels", 32),
    )
    model.load_state_dict(checkpoint["mlp_state_dict"])
    model.eval()
    return model, checkpoint["feature_mean"], checkpoint["feature_std"], checkpoint.get("feature_names", [])


def sigmoid_score(logit: float) -> float:
    import math

    return float(1.0 / (1.0 + math.exp(-logit)))
