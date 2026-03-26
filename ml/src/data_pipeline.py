from __future__ import annotations

import pandas as pd
import numpy as np
from pathlib import Path


TRANSACTION_COLUMNS = [
    "TransactionID",
    "TransactionDT",
    "TransactionAmt",
    "ProductCD",
    "card1",
    "addr1",
    "P_emaildomain",
    "isFraud",
]

IDENTITY_COLUMNS = [
    "TransactionID",
    "DeviceType",
]


def _resolve_identity_path(transaction_path: Path) -> Path | None:
    candidate = transaction_path.with_name("train_identity.csv")
    if candidate.exists():
        return candidate
    return None


def load_transactions(csv_path: str | Path, identity_csv_path: str | Path | None = None) -> pd.DataFrame:
    transaction_path = Path(csv_path)
    frame = pd.read_csv(
        transaction_path,
        usecols=TRANSACTION_COLUMNS,
        dtype={
            "TransactionID": "int64",
            "TransactionDT": "int64",
            "TransactionAmt": "float32",
            "ProductCD": "string",
            "card1": "Int64",
            "addr1": "Float32",
            "P_emaildomain": "string",
            "isFraud": "int8",
        },
    )
    missing = [column for column in TRANSACTION_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")

    resolved_identity_path = Path(identity_csv_path) if identity_csv_path else _resolve_identity_path(transaction_path)
    if resolved_identity_path and resolved_identity_path.exists():
        identity = pd.read_csv(
            resolved_identity_path,
            usecols=IDENTITY_COLUMNS,
            dtype={
                "TransactionID": "int64",
                "DeviceType": "string",
            },
        )
        frame = frame.merge(identity, on="TransactionID", how="left")
    else:
        frame["DeviceType"] = "unknown"

    return frame.copy()


def prepare_transactions(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    df["ProductCD"] = df["ProductCD"].fillna("unknown")
    df["DeviceType"] = df["DeviceType"].fillna("unknown")
    df["P_emaildomain"] = df["P_emaildomain"].fillna("unknown")
    df["sender_id"] = df["card1"].astype(str)
    df["receiver_id"] = df["addr1"].astype(str)
    df["txn_hour_bucket"] = (df["TransactionDT"] // 3600).astype(int)
    df["amount_log"] = np.log1p(df["TransactionAmt"].clip(lower=0))
    return df.sort_values("TransactionDT").reset_index(drop=True)
