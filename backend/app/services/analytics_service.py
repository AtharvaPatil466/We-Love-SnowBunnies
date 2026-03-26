from __future__ import annotations

from app.schemas import AnalyticsMetric, GraphAnalyticsResponse, GraphResponse


class GraphAnalyticsService:
    def summarize(self, graph: GraphResponse) -> GraphAnalyticsResponse:
        high_risk_nodes = sum(1 for node in graph.nodes if node.risk_score >= 0.8)
        high_risk_edges = sum(1 for edge in graph.edges if edge.risk_score >= 0.8)

        low_volume = sum(edge.amount for edge in graph.edges if edge.risk_score < 0.45)
        medium_volume = sum(edge.amount for edge in graph.edges if 0.45 <= edge.risk_score < 0.8)
        high_volume = sum(edge.amount for edge in graph.edges if edge.risk_score >= 0.8)

        medium_rings = sum(1 for ring in graph.rings if ring.risk_label == "medium")
        high_rings = sum(1 for ring in graph.rings if ring.risk_label == "high")

        return GraphAnalyticsResponse(
            user_id=graph.user_id,
            total_nodes=len(graph.nodes),
            total_edges=len(graph.edges),
            detected_rings=len(graph.rings),
            high_risk_nodes=high_risk_nodes,
            high_risk_edges=high_risk_edges,
            volume_by_risk_band=[
                AnalyticsMetric(label="Low", value=round(low_volume, 2)),
                AnalyticsMetric(label="Medium", value=round(medium_volume, 2)),
                AnalyticsMetric(label="High", value=round(high_volume, 2)),
            ],
            ring_risk_distribution=[
                AnalyticsMetric(label="Medium rings", value=medium_rings),
                AnalyticsMetric(label="High rings", value=high_rings),
            ],
        )
