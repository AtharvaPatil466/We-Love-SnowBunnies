from __future__ import annotations

import argparse
import json
from pathlib import Path

import networkx as nx
import torch
from sklearn.model_selection import train_test_split

from src.config import TrainingConfig
from src.data_pipeline import load_transactions, prepare_transactions
from src.evaluate import evaluate_runtime_scorer, write_metrics
from src.graph_builder import build_transaction_graph
from src.models import GATFraudDetector, NodeRiskMLP

try:
    from torch_geometric.data import Data
except ImportError as exc:  # pragma: no cover
    raise ImportError("torch-geometric must be installed to run training") from exc


def build_pyg_data(graph: nx.DiGraph) -> tuple[Data, list[str]]:
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
        raise ValueError("Graph has no edges; cannot train model")

    data = Data(
        x=torch.tensor(x, dtype=torch.float32),
        edge_index=torch.tensor(edge_index, dtype=torch.long).t().contiguous(),
        y=torch.tensor(y, dtype=torch.float32),
    )
    return data, nodes


def train(csv_path: str, config: TrainingConfig) -> tuple[Path, dict[str, float]]:
    frame = prepare_transactions(load_transactions(csv_path))
    train_df, eval_df = train_test_split(
        frame,
        test_size=0.2,
        random_state=42,
        stratify=frame[config.target_column],
    )
    graph = build_transaction_graph(train_df)
    data, nodes = build_pyg_data(graph)

    model = GATFraudDetector(in_channels=data.x.shape[1], hidden_channels=config.hidden_channels)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate)
    positive_count = max(int(data.y.sum().item()), 1)
    negative_count = max(int((data.y == 0).sum().item()), 1)
    pos_weight = torch.tensor([negative_count / positive_count], dtype=torch.float32)
    loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    model.train()
    for epoch in range(config.epochs):
        optimizer.zero_grad()
        logits = model(data)
        loss = loss_fn(logits, data.y)
        loss.backward()
        optimizer.step()
        if epoch % 5 == 0:
            print(f"epoch={epoch} loss={loss.item():.4f}")

    feature_mean = data.x.mean(dim=0)
    feature_std = data.x.std(dim=0)
    feature_std = torch.where(feature_std == 0, torch.ones_like(feature_std), feature_std)
    normalized_x = (data.x - feature_mean) / feature_std

    mlp = NodeRiskMLP(in_channels=data.x.shape[1], hidden_channels=max(config.hidden_channels // 2, 16))
    mlp_optimizer = torch.optim.Adam(mlp.parameters(), lr=config.learning_rate)
    mlp_loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    mlp.train()
    for epoch in range(max(config.epochs // 2, 10)):
        mlp_optimizer.zero_grad()
        logits = mlp(normalized_x)
        loss = mlp_loss_fn(logits, data.y)
        loss.backward()
        mlp_optimizer.step()
        if epoch % 5 == 0:
            print(f"mlp_epoch={epoch} loss={loss.item():.4f}")

    config.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    output_path = config.checkpoint_dir / "fraudsense_gat.pt"
    eval_graph = build_transaction_graph(eval_df)
    metrics = evaluate_runtime_scorer(
        graph=eval_graph,
        feature_mean=feature_mean,
        feature_std=feature_std,
        in_channels=data.x.shape[1],
        hidden_channels=max(config.hidden_channels // 2, 16),
        state_dict=mlp.state_dict(),
    )
    metrics_path = write_metrics(config.checkpoint_dir / "fraudsense_metrics.json", metrics)
    torch.save(
        {
            "version": 2,
            "state_dict": model.state_dict(),
            "mlp_state_dict": mlp.state_dict(),
            "node_order": nodes,
            "in_channels": data.x.shape[1],
            "hidden_channels": config.hidden_channels,
            "mlp_hidden_channels": max(config.hidden_channels // 2, 16),
            "feature_mean": feature_mean,
            "feature_std": feature_std,
            "feature_names": [
                "transaction_count",
                "avg_amount",
                "unique_counterparties",
                "device_diversity",
            ],
            "metrics": metrics,
            "metrics_path": str(metrics_path),
        },
        output_path,
    )
    return output_path, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train FraudSense GAT model")
    parser.add_argument("--csv", required=True, help="Path to IEEE-CIS train_transaction.csv")
    args = parser.parse_args()

    config = TrainingConfig()
    checkpoint, metrics = train(args.csv, config)
    print(f"Saved checkpoint to {checkpoint}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
