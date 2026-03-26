from __future__ import annotations

import torch
from torch import nn

try:
    from torch_geometric.nn import GATConv
except ImportError as exc:  # pragma: no cover
    GATConv = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


class GATFraudDetector(nn.Module):
    def __init__(self, in_channels: int, hidden_channels: int = 64, heads: int = 4) -> None:
        super().__init__()
        if GATConv is None:
            raise ImportError("torch-geometric is required to instantiate GATFraudDetector") from IMPORT_ERROR
        self.gat1 = GATConv(in_channels, hidden_channels, heads=heads, dropout=0.2)
        self.gat2 = GATConv(hidden_channels * heads, hidden_channels, heads=1, dropout=0.2)
        self.output = nn.Linear(hidden_channels, 1)

    def forward(self, data):
        x = self.gat1(data.x, data.edge_index)
        x = torch.relu(x)
        x = self.gat2(x, data.edge_index)
        x = torch.relu(x)
        logits = self.output(x).squeeze(-1)
        return logits


class NodeRiskMLP(nn.Module):
    def __init__(self, in_channels: int, hidden_channels: int = 32) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(in_channels, hidden_channels),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Linear(hidden_channels // 2, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x).squeeze(-1)
