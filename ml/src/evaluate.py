from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
import torch
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
from torch_geometric.data import Data

from src.models import NodeRiskMLP


def build_eval_data(graph: nx.DiGraph) -> Data:
    nodes = list(graph.nodes)
    node_index = {node: idx for idx, node in enumerate(nodes)}
    x = []
    y = []
    for node in nodes:
        attrs = graph.nodes[node]
        x.append([
            float(attrs.get("transaction_count", 0.0)),
            float(attrs.get("avg_amount", 0.0)),
            float(attrs.get("unique_counterparties", 0.0)),
            float(attrs.get("device_diversity", 0.0)),
        ])
        edge_labels = [data.get("label", 0) for _, _, data in graph.out_edges(node, data=True)]
        y.append(float(max(edge_labels) if edge_labels else 0))

    edge_index = [
        [node_index[source], node_index[target]]
        for source, target in graph.edges()
    ]
    if not edge_index:
        raise ValueError("Graph has no edges; cannot evaluate model")

    return Data(
        x=torch.tensor(x, dtype=torch.float32),
        edge_index=torch.tensor(edge_index, dtype=torch.long).t().contiguous(),
        y=torch.tensor(y, dtype=torch.float32),
    )


def evaluate_runtime_scorer(
    graph: nx.DiGraph,
    feature_mean: torch.Tensor,
    feature_std: torch.Tensor,
    in_channels: int,
    hidden_channels: int,
    state_dict: dict,
) -> dict[str, float]:
    data = build_eval_data(graph)
    safe_std = torch.where(feature_std == 0, torch.ones_like(feature_std), feature_std)
    normalized_x = (data.x - feature_mean) / safe_std

    model = NodeRiskMLP(in_channels=in_channels, hidden_channels=hidden_channels)
    model.load_state_dict(state_dict)
    model.eval()

    with torch.no_grad():
        probabilities = torch.sigmoid(model(normalized_x)).numpy()

    labels = data.y.numpy()
    binary_predictions = (probabilities >= 0.5).astype(int)

    metrics = {
        "auc_roc": float(roc_auc_score(labels, probabilities)) if len(set(labels.tolist())) > 1 else 0.0,
        "average_precision": float(average_precision_score(labels, probabilities)),
        "precision": float(precision_score(labels, binary_predictions, zero_division=0)),
        "recall": float(recall_score(labels, binary_predictions, zero_division=0)),
        "f1_score": float(f1_score(labels, binary_predictions, zero_division=0)),
    }
    return metrics


def write_metrics(path: str | Path, metrics: dict[str, float]) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return output_path
