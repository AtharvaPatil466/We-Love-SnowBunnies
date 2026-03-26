from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.alert_service import AlertService
from app.services.auth_service import AuthService
from app.services.case_service import InvestigationCaseService
from app.services.graph_service import TransactionGraphService


def build_client() -> TestClient:
    app.dependency_overrides = {}
    return TestClient(app)


def reset_state() -> None:
    import app.main as main_module
    from app.core.settings import settings

    if settings.resolved_auth_users_path.exists():
        settings.resolved_auth_users_path.unlink()

    main_module.graph_service = TransactionGraphService()
    main_module.alert_service = AlertService()
    main_module.case_service = InvestigationCaseService()
    main_module.auth_service = AuthService()


def auth_headers(client: TestClient, username: str = "asha", password: str = "asha@1234") -> dict[str, str]:
    login_response = client.post("/auth/login", json={"username": username, "password": password})
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_endpoint_reports_runtime_state() -> None:
    reset_state()
    client = build_client()

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["graph_store"] in {"memory", "neo4j"}
    assert "model_source" in payload
    assert payload["push_mode"] in {"expo-dry-run", "expo-live"}


def test_auth_endpoints_return_seeded_users_and_profile() -> None:
    reset_state()
    client = build_client()

    login_response = client.post("/auth/login", json={"username": "asha", "password": "asha@1234"})
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["success"] is True
    assert login_payload["user"]["role"] == "analyst"
    assert login_payload["token_type"] == "bearer"

    headers = {"Authorization": f"Bearer {login_payload['access_token']}"}
    profile_response = client.get("/auth/me", headers=headers)
    assert profile_response.status_code == 200
    assert profile_response.json()["username"] == "asha"

    users_response = client.get("/auth/users", headers=headers)
    assert users_response.status_code == 200
    users_payload = users_response.json()
    assert len(users_payload["users"]) >= 2


def test_customer_registration_returns_bearer_token() -> None:
    reset_state()
    client = build_client()

    response = client.post(
        "/auth/register",
        json={
            "username": "new_customer",
            "password": "newcustomer@123",
            "display_name": "New Customer",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["role"] == "customer"
    assert payload["token_type"] == "bearer"


def test_predict_creates_graph_data_and_alerts() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    response = client.post(
        "/predict",
        json={
            "transaction_id": "test_txn_001",
            "sender_id": "user_test_01",
            "receiver_id": "merchant_test_01",
            "amount": 7200,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_test_01",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )

    assert response.status_code == 200
    prediction = response.json()
    assert prediction["transaction_id"] == "test_txn_001"
    assert 0 <= prediction["fraud_probability"] <= 1
    assert prediction["risk_label"] in {"medium", "high"}

    customer_headers = auth_headers(client, username="ria", password="ria@1234")
    graph_response = client.get("/graph/user_test_01", headers=headers)
    assert graph_response.status_code == 200
    graph_payload = graph_response.json()
    assert len(graph_payload["nodes"]) >= 1
    assert len(graph_payload["edges"]) >= 1

    alerts_response = client.get("/alerts/user_test_01", headers=headers)
    assert alerts_response.status_code == 200
    alerts_payload = alerts_response.json()
    assert len(alerts_payload["alerts"]) >= 1

    forbidden_response = client.get("/graph/user_test_01", headers=customer_headers)
    assert forbidden_response.status_code == 403


def test_device_registration_endpoint_accepts_push_tokens() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    response = client.post(
        "/devices/register",
        json={
            "user_id": "user_test_01",
            "expo_push_token": "ExponentPushToken[test-token]",
            "platform": "android",
            "device_label": "Pixel demo",
        },
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["registered"] is True
    assert payload["channel"] == "expo-push"


def test_analytics_and_rings_return_structured_payloads() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    client.post(
        "/predict",
        json={
            "transaction_id": "test_txn_analytics",
            "sender_id": "user_01",
            "receiver_id": "merchant_24",
            "amount": 5600,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_new",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )

    analytics_response = client.get("/analytics/user_01", headers=headers)
    assert analytics_response.status_code == 200
    analytics = analytics_response.json()
    assert analytics["total_nodes"] >= 1
    assert analytics["total_edges"] >= 1
    assert len(analytics["volume_by_risk_band"]) == 3

    rings_response = client.get("/rings/user_01", headers=headers)
    assert rings_response.status_code == 200
    rings_payload = rings_response.json()
    assert "rings" in rings_payload


def test_node_detail_returns_explicit_entity_context() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    client.post(
        "/predict",
        json={
            "transaction_id": "test_txn_node_detail",
            "sender_id": "user_detail_01",
            "receiver_id": "merchant_detail_01",
            "amount": 6400,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_detail_01",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )

    response = client.get("/node/user_detail_01", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["node_id"] == "user_detail_01"
    assert payload["transaction_count"] >= 1
    assert len(payload["recent_transactions"]) >= 1


def test_ring_detail_returns_member_and_transaction_context() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    client.post(
        "/predict",
        json={
            "transaction_id": "test_txn_ring_detail",
            "sender_id": "user_01",
            "receiver_id": "merchant_24",
            "amount": 6100,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_ring_01",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )

    response = client.get("/ring/ring_0", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["ring_id"] == "ring_0"
    assert payload["node_count"] >= 1
    assert "member_nodes" in payload


def test_investigation_summary_returns_exportable_case_context() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    client.post(
        "/predict",
        json={
            "transaction_id": "test_txn_investigation",
            "sender_id": "user_01",
            "receiver_id": "merchant_24",
            "amount": 6700,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_investigation_01",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )

    response = client.get("/investigation/user_01?ring_id=ring_0&node_id=user_01", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == "user_01"
    assert payload["ring_id"] == "ring_0"
    assert payload["node_id"] == "user_01"
    assert payload["risk_label"] in {"medium", "high"}
    assert len(payload["key_observations"]) >= 1
    assert "evidence" in payload


def test_case_endpoints_store_investigation_workflow_state() -> None:
    reset_state()
    client = build_client()
    headers = auth_headers(client)

    create_response = client.post(
        "/cases",
        json={
            "user_id": "user_01",
            "ring_id": "ring_0",
            "node_id": "user_01",
            "title": "Escalate suspected merchant ring",
            "status": "escalated",
            "assigned_to": "Asha",
            "due_at": "2026-03-27T15:30:00+00:00",
            "tags": ["upi", "ring", "priority"],
            "analyst_notes": "Multiple connected entities and elevated payment volume."
        },
        headers=headers,
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["status"] == "escalated"
    assert created["assigned_to"] == "Asha"
    assert created["due_at"] == "2026-03-27T15:30:00+00:00"
    assert created["is_stale"] is False
    assert created["priority_label"] == "high"
    assert "priority" in created["tags"]

    list_response = client.get("/cases/user_01", headers=headers)
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["user_id"] == "user_01"
    assert len(payload["cases"]) == 1
    assert payload["cases"][0]["title"] == "Escalate suspected merchant ring"
    assert len(payload["cases"][0]["history"]) == 1

    update_response = client.post(
        "/cases",
        json={
            "user_id": "user_01",
            "ring_id": "ring_0",
            "node_id": "user_01",
            "title": "Escalate suspected merchant ring",
            "status": "monitoring",
            "assigned_to": "Rahul",
            "due_at": "2026-03-25T10:30:00+00:00",
            "tags": ["upi", "ring"],
            "analyst_notes": "Watching for repeat movement."
        },
        headers=headers,
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert len(updated["history"]) == 2
    assert updated["assigned_to"] == "Rahul"
    assert updated["is_stale"] is True
    assert updated["priority_label"] == "high"

    filtered_response = client.get("/cases/user_01?status=monitoring", headers=headers)
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert len(filtered_payload["cases"]) == 1
    assert filtered_payload["cases"][0]["status"] == "monitoring"

    owner_response = client.get("/cases/user_01?assigned_to=Rahul", headers=headers)
    assert owner_response.status_code == 200
    owner_payload = owner_response.json()
    assert len(owner_payload["cases"]) == 1
    assert owner_payload["cases"][0]["assigned_to"] == "Rahul"

    stale_response = client.get("/cases/user_01?stale_only=true", headers=headers)
    assert stale_response.status_code == 200
    stale_payload = stale_response.json()
    assert len(stale_payload["cases"]) == 1
    assert stale_payload["cases"][0]["is_stale"] is True
