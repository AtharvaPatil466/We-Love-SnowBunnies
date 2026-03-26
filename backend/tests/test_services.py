from __future__ import annotations

from app.schemas import DeviceRegistrationPayload, GraphEdge, GraphNode, GraphResponse, InvestigationCaseUpsertPayload, PredictionResponse
from app.services.alert_service import AlertService
from app.services.analytics_service import GraphAnalyticsService
from app.services.case_service import InvestigationCaseService


def test_alert_service_skips_low_risk_predictions() -> None:
    service = AlertService()
    prediction = PredictionResponse(
        transaction_id="txn_low",
        fraud_probability=0.12,
        risk_label="low",
        contributing_factors=["baseline"],
    )

    record = service.create_from_prediction("user_low", prediction)

    assert record is None
    assert service.list_for_user("user_low").alerts == []


def test_alert_service_stores_medium_or_high_alerts() -> None:
    service = AlertService()
    service.register_device(
        DeviceRegistrationPayload(
            user_id="user_high",
            expo_push_token="ExponentPushToken[test-token]",
            platform="android",
            device_label="Pixel demo",
        )
    )
    prediction = PredictionResponse(
        transaction_id="txn_high",
        fraud_probability=0.91,
        risk_label="high",
        contributing_factors=["high amount"],
        linked_ring_ids=["ring_7"],
    )

    record = service.create_from_prediction("user_high", prediction)

    assert record is not None
    assert record.user_id == "user_high"
    assert "ring_7" in record.message
    assert record.channel in {"expo-push", "in-app"}
    assert len(service.list_for_user("user_high").alerts) == 1


def test_analytics_service_aggregates_graph_metrics() -> None:
    service = GraphAnalyticsService()
    graph = GraphResponse(
        user_id="user_01",
        nodes=[
            GraphNode(id="a", label="a", risk_score=0.9, community=0),
            GraphNode(id="b", label="b", risk_score=0.4, community=0),
        ],
        edges=[
            GraphEdge(source="a", target="b", amount=8000, timestamp="2026-03-26T11:30:00Z", risk_score=0.82),
            GraphEdge(source="b", target="a", amount=1200, timestamp="2026-03-26T11:32:00Z", risk_score=0.25),
        ],
        rings=[],
    )

    summary = service.summarize(graph)

    assert summary.total_nodes == 2
    assert summary.total_edges == 2
    assert summary.high_risk_nodes == 1
    assert summary.high_risk_edges == 1
    assert [metric.label for metric in summary.volume_by_risk_band] == ["Low", "Medium", "High"]


def test_case_service_upserts_by_ring_and_node_context() -> None:
    service = InvestigationCaseService()

    created = service.upsert(
        InvestigationCaseUpsertPayload(
            user_id="user_01",
            ring_id="ring_0",
            node_id="user_01",
            title="Review mule behavior",
            status="open",
            assigned_to="Asha",
            due_at="2026-03-27T10:00:00+00:00",
            tags=["upi"],
            analyst_notes="Initial observation.",
        )
    )

    updated = service.upsert(
        InvestigationCaseUpsertPayload(
            user_id="user_01",
            ring_id="ring_0",
            node_id="user_01",
            title="Review mule behavior",
            status="monitoring",
            assigned_to="Rahul",
            due_at="2026-03-25T10:00:00+00:00",
            tags=["upi", "watch"],
            analyst_notes="Watching for repeat behavior.",
        )
    )

    assert created.case_id == updated.case_id
    assert updated.status == "monitoring"
    assert updated.assigned_to == "Rahul"
    assert updated.is_stale is True
    assert updated.priority_label == "high"
    assert updated.priority_score >= 65
    assert len(updated.history) == 2
    assert updated.history[0].status == "monitoring"
    assert updated.history[0].assigned_to == "Rahul"
    assert updated.history[0].due_at == "2026-03-25T10:00:00+00:00"
    assert len(service.list_for_user("user_01").cases) == 1
    assert len(service.list_for_user("user_01", status="monitoring").cases) == 1
    assert len(service.list_for_user("user_01", assigned_to="Rahul").cases) == 1
    assert len(service.list_for_user("user_01", stale_only=True).cases) == 1
