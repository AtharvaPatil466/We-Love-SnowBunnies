from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.settings import settings
from app.schemas import AlertPayload, AlertResponse, AlertsResponse, AuthLoginPayload, AuthRegisterPayload, AuthTokenResponse, AuthUsersResponse, DeviceRegistrationPayload, DeviceRegistrationResponse, GraphAnalyticsResponse, GraphResponse, InvestigationCaseRecord, InvestigationCasesResponse, InvestigationCaseUpsertPayload, InvestigationSummaryResponse, NodeDetailResponse, PredictionResponse, RingDetailResponse, RingResponse, TransactionPayload, UserProfile
from app.services.analytics_service import GraphAnalyticsService
from app.services.alert_service import AlertService
from app.services.auth_service import AuthService
from app.services.case_service import InvestigationCaseService
from app.services.graph_service import TransactionGraphService
from app.services.model_service import FraudModelService

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("fraudsense.api")

app = FastAPI(
    title=settings.app_name,
    description="Graph-aware fraud scoring and fraud ring exploration for UPI and card transactions.",
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_service = FraudModelService()
graph_service = TransactionGraphService()
alert_service = AlertService()
analytics_service = GraphAnalyticsService()
case_service = InvestigationCaseService()
auth_service = AuthService()
security = HTTPBearer(auto_error=False)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = uuid4().hex[:8]
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers["X-Request-Id"] = request_id
    return response


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> UserProfile:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer token required")
    return auth_service.resolve_token(credentials.credentials)


@app.get("/health")
def health() -> dict[str, str]:
    checkpoint = model_service.checkpoint_path.name if model_service.checkpoint_path and model_service.checkpoint_path.exists() else None
    return {
        "status": "ok",
        "model_source": model_service.model_source,
        "checkpoint": checkpoint or "none",
        "graph_store": "neo4j" if graph_service.repository.enabled else "memory",
        "push_mode": "expo-dry-run" if settings.expo_push_dry_run else "expo-live",
    }


@app.get("/auth/users", response_model=AuthUsersResponse)
def list_users(current_user: UserProfile = Depends(get_current_user)) -> AuthUsersResponse:
    auth_service.ensure_analyst(current_user)
    return auth_service.list_users()


@app.post("/auth/login", response_model=AuthTokenResponse)
def login(payload: AuthLoginPayload) -> AuthTokenResponse:
    return auth_service.login(payload)


@app.post("/auth/register", response_model=AuthTokenResponse)
def register(payload: AuthRegisterPayload) -> AuthTokenResponse:
    return auth_service.register(payload)


@app.get("/auth/me", response_model=UserProfile)
def me(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    return current_user


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: TransactionPayload, current_user: UserProfile = Depends(get_current_user)) -> PredictionResponse:
    auth_service.ensure_user_access(current_user, payload.sender_id)
    sender_profile = graph_service.sender_profile(
        payload.sender_id,
        receiver_id=payload.receiver_id,
        device_id=payload.device_id,
        pending_amount=payload.amount,
    )
    prediction = model_service.predict(payload, sender_profile=sender_profile)
    graph_service.add_transaction(payload, prediction)
    prediction.linked_ring_ids = graph_service.rings_for_transaction(payload.sender_id, payload.receiver_id)
    alert_service.create_from_prediction(payload.sender_id, prediction)
    return prediction


@app.get("/graph/{user_id}", response_model=GraphResponse)
def graph(user_id: str, current_user: UserProfile = Depends(get_current_user)) -> GraphResponse:
    auth_service.ensure_user_access(current_user, user_id)
    return graph_service.user_subgraph(user_id)


@app.get("/rings/{user_id}", response_model=RingResponse)
def rings(user_id: str, current_user: UserProfile = Depends(get_current_user)) -> RingResponse:
    auth_service.ensure_user_access(current_user, user_id)
    return graph_service.rings_for_user(user_id)


@app.get("/analytics/{user_id}", response_model=GraphAnalyticsResponse)
def analytics(user_id: str, current_user: UserProfile = Depends(get_current_user)) -> GraphAnalyticsResponse:
    auth_service.ensure_user_access(current_user, user_id)
    graph = graph_service.user_subgraph(user_id)
    return analytics_service.summarize(graph)


@app.get("/node/{node_id}", response_model=NodeDetailResponse)
def node_detail(node_id: str, current_user: UserProfile = Depends(get_current_user)) -> NodeDetailResponse:
    return graph_service.node_detail(node_id)


@app.get("/ring/{ring_id}", response_model=RingDetailResponse)
def ring_detail(ring_id: str, current_user: UserProfile = Depends(get_current_user)) -> RingDetailResponse:
    return graph_service.ring_detail(ring_id)


@app.get("/investigation/{user_id}", response_model=InvestigationSummaryResponse)
def investigation_summary(
    user_id: str,
    ring_id: str | None = None,
    node_id: str | None = None,
    current_user: UserProfile = Depends(get_current_user),
) -> InvestigationSummaryResponse:
    auth_service.ensure_user_access(current_user, user_id)
    return graph_service.investigation_summary(user_id, ring_id=ring_id, node_id=node_id)


@app.get("/cases/{user_id}", response_model=InvestigationCasesResponse)
def list_cases(
    user_id: str,
    status: str | None = None,
    assigned_to: str | None = None,
    stale_only: bool = False,
    current_user: UserProfile = Depends(get_current_user),
) -> InvestigationCasesResponse:
    auth_service.ensure_user_access(current_user, user_id)
    return case_service.list_for_user(user_id, status=status, assigned_to=assigned_to, stale_only=stale_only)


@app.post("/cases", response_model=InvestigationCaseRecord)
def upsert_case(payload: InvestigationCaseUpsertPayload, current_user: UserProfile = Depends(get_current_user)) -> InvestigationCaseRecord:
    auth_service.ensure_analyst(current_user)
    return case_service.upsert(payload)


@app.post("/alert", response_model=AlertResponse)
def alert(payload: AlertPayload, current_user: UserProfile = Depends(get_current_user)) -> AlertResponse:
    auth_service.ensure_user_access(current_user, payload.user_id)
    return alert_service.send(payload)


@app.post("/devices/register", response_model=DeviceRegistrationResponse)
def register_device(payload: DeviceRegistrationPayload, current_user: UserProfile = Depends(get_current_user)) -> DeviceRegistrationResponse:
    auth_service.ensure_user_access(current_user, payload.user_id)
    return alert_service.register_device(payload)


@app.get("/alerts/{user_id}", response_model=AlertsResponse)
def alerts(user_id: str, current_user: UserProfile = Depends(get_current_user)) -> AlertsResponse:
    auth_service.ensure_user_access(current_user, user_id)
    return alert_service.list_for_user(user_id)
