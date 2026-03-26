from __future__ import annotations

from pathlib import Path
import sys

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from app.main import app


def main() -> None:
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200, health.text

    login = client.post(
        "/auth/login",
        json={
            "username": "asha",
            "password": "asha@1234",
        },
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    prediction = client.post(
        "/predict",
        json={
            "transaction_id": "smoke_demo_001",
            "sender_id": "user_smoke_01",
            "receiver_id": "merchant_smoke_01",
            "amount": 6800,
            "timestamp": "2026-03-26T11:30:00Z",
            "device_id": "device_smoke",
            "product_type": "UPI",
            "email_domain": "mail.xyz",
            "location": "Proxy",
        },
        headers=headers,
    )
    assert prediction.status_code == 200, prediction.text
    prediction_data = prediction.json()
    assert "fraud_probability" in prediction_data

    graph = client.get("/graph/user_smoke_01", headers=headers)
    assert graph.status_code == 200, graph.text
    graph_data = graph.json()
    assert "nodes" in graph_data and "edges" in graph_data

    analytics = client.get("/analytics/user_smoke_01", headers=headers)
    assert analytics.status_code == 200, analytics.text

    alerts = client.get("/alerts/user_smoke_01", headers=headers)
    assert alerts.status_code == 200, alerts.text

    print("Smoke test passed.")
    print(
        {
            "health": health.json(),
            "prediction": prediction_data,
            "graph_nodes": len(graph_data["nodes"]),
            "graph_edges": len(graph_data["edges"]),
            "alerts": len(alerts.json()["alerts"]),
        }
    )


if __name__ == "__main__":
    main()
