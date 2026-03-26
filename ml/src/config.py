from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class TrainingConfig:
    target_column: str = "isFraud"
    account_columns: tuple[str, str] = ("card1", "addr1")
    edge_feature_columns: tuple[str, ...] = (
        "TransactionAmt",
        "TransactionDT",
        "ProductCD",
    )
    node_feature_columns: tuple[str, ...] = (
        "transaction_count",
        "avg_amount",
        "unique_counterparties",
        "device_diversity",
    )
    hidden_channels: int = 64
    learning_rate: float = 1e-3
    epochs: int = 25
    checkpoint_dir: Path = Path("checkpoints")

