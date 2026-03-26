from __future__ import annotations

import networkx as nx
import pandas as pd


def build_transaction_graph(frame: pd.DataFrame) -> nx.DiGraph:
    graph = nx.DiGraph()

    grouped = frame.groupby("sender_id")
    node_features = grouped.agg(
        transaction_count=("TransactionID", "count"),
        avg_amount=("TransactionAmt", "mean"),
        unique_counterparties=("receiver_id", "nunique"),
        device_diversity=("DeviceType", "nunique"),
    )

    for node_id, features in node_features.iterrows():
        graph.add_node(
            str(node_id),
            transaction_count=float(features["transaction_count"]),
            avg_amount=float(features["avg_amount"]),
            unique_counterparties=float(features["unique_counterparties"]),
            device_diversity=float(features["device_diversity"]),
        )

    for row in frame.itertuples(index=False):
        graph.add_node(str(row.receiver_id))
        graph.add_edge(
            str(row.sender_id),
            str(row.receiver_id),
            transaction_id=str(row.TransactionID),
            amount=float(row.TransactionAmt),
            time_delta=float(row.TransactionDT),
            product_code=str(row.ProductCD),
            label=int(row.isFraud),
        )

    return graph


def high_risk_subgraph(graph: nx.DiGraph, threshold: float = 0.7) -> nx.Graph:
    risky_edges = [
        (source, target, data)
        for source, target, data in graph.edges(data=True)
        if data.get("risk_score", data.get("label", 0.0)) >= threshold
    ]
    subgraph = nx.Graph()
    subgraph.add_edges_from((source, target, data) for source, target, data in risky_edges)
    return subgraph

