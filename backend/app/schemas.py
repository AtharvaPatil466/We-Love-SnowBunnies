from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TransactionPayload(BaseModel):
    transaction_id: str = Field(..., examples=["txn_1001"])
    sender_id: str = Field(..., examples=["user_01"])
    receiver_id: str = Field(..., examples=["merchant_77"])
    amount: float = Field(..., gt=0)
    timestamp: str = Field(..., examples=["2026-03-26T11:30:00Z"])
    device_id: str = Field(..., examples=["device_a1"])
    product_type: str = Field(default="UPI")
    email_domain: str | None = Field(default=None, examples=["gmail.com"])
    location: str | None = Field(default=None, examples=["Mumbai"])


class PredictionResponse(BaseModel):
    transaction_id: str
    fraud_probability: float
    risk_label: Literal["low", "medium", "high"]
    contributing_factors: list[str]
    linked_ring_ids: list[str] = Field(default_factory=list)


class AlertPayload(BaseModel):
    user_id: str
    transaction_id: str
    fraud_probability: float = Field(..., ge=0, le=1)
    message: str


class AlertResponse(BaseModel):
    delivered: bool
    channel: str
    message: str


class DeviceRegistrationPayload(BaseModel):
    user_id: str
    expo_push_token: str
    platform: Literal["android", "ios", "web"] = "android"
    device_label: str | None = None


class DeviceRegistrationResponse(BaseModel):
    registered: bool
    user_id: str
    channel: str
    message: str


class AlertRecord(BaseModel):
    alert_id: str
    user_id: str
    transaction_id: str
    fraud_probability: float
    risk_label: Literal["medium", "high"]
    message: str
    created_at: str
    delivered: bool
    channel: str = "push"


class AlertsResponse(BaseModel):
    user_id: str
    alerts: list[AlertRecord]


class UserProfile(BaseModel):
    user_id: str
    username: str
    display_name: str
    role: Literal["analyst", "customer"]
    linked_user_id: str


class AuthUsersResponse(BaseModel):
    users: list[UserProfile]


class AuthLoginPayload(BaseModel):
    username: str
    password: str


class AuthRegisterPayload(BaseModel):
    username: str
    password: str = Field(..., min_length=8)
    display_name: str
    role: Literal["customer"] = "customer"
    linked_user_id: str | None = None


class AuthTokenResponse(BaseModel):
    success: bool
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserProfile


class SenderProfile(BaseModel):
    sender_id: str
    transaction_count: int = 0
    avg_amount: float = 0.0
    unique_counterparties: int = 0
    device_diversity: int = 0


class GraphNode(BaseModel):
    id: str
    label: str
    risk_score: float = 0.0
    community: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str
    amount: float
    timestamp: str
    risk_score: float = 0.0


class GraphResponse(BaseModel):
    user_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    rings: list["FraudRing"]


class FraudRing(BaseModel):
    ring_id: str
    community: int
    node_ids: list[str]
    edge_count: int
    avg_risk_score: float
    total_amount: float
    risk_label: Literal["medium", "high"]


class RingResponse(BaseModel):
    user_id: str
    rings: list[FraudRing]


class AnalyticsMetric(BaseModel):
    label: str
    value: float


class GraphAnalyticsResponse(BaseModel):
    user_id: str
    total_nodes: int
    total_edges: int
    detected_rings: int
    high_risk_nodes: int
    high_risk_edges: int
    volume_by_risk_band: list[AnalyticsMetric]
    ring_risk_distribution: list[AnalyticsMetric]


class NodeTransactionDetail(BaseModel):
    transaction_id: str
    source: str
    target: str
    amount: float
    timestamp: str
    risk_score: float
    direction: Literal["incoming", "outgoing"]
    counterparty: str


class NodeDetailResponse(BaseModel):
    node_id: str
    label: str
    risk_score: float
    community: int
    transaction_count: int
    avg_amount: float
    unique_counterparties: int
    device_diversity: int
    total_amount: float
    counterparties: list[str]
    recent_transactions: list[NodeTransactionDetail]


class RingMemberDetail(BaseModel):
    node_id: str
    label: str
    risk_score: float
    community: int


class RingDetailResponse(BaseModel):
    ring_id: str
    community: int
    risk_label: Literal["medium", "high"]
    avg_risk_score: float
    total_amount: float
    edge_count: int
    node_count: int
    member_nodes: list[RingMemberDetail]
    top_counterparties: list[str]
    recent_transactions: list[NodeTransactionDetail]


class InvestigationSummaryResponse(BaseModel):
    user_id: str
    ring_id: str | None = None
    node_id: str | None = None
    risk_label: Literal["low", "medium", "high"]
    headline: str
    summary: str
    key_observations: list[str]
    recommended_actions: list[str]
    evidence: dict[str, int | float]


class InvestigationCaseUpsertPayload(BaseModel):
    user_id: str
    ring_id: str | None = None
    node_id: str | None = None
    title: str
    status: Literal["open", "monitoring", "escalated", "resolved"] = "open"
    assigned_to: str = "Unassigned"
    due_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    analyst_notes: str = ""


class InvestigationCaseHistoryEntry(BaseModel):
    status: Literal["open", "monitoring", "escalated", "resolved"]
    assigned_to: str
    due_at: str | None = None
    analyst_notes: str
    tags: list[str]
    updated_at: str


class InvestigationCaseRecord(BaseModel):
    case_id: str
    user_id: str
    ring_id: str | None = None
    node_id: str | None = None
    title: str
    status: Literal["open", "monitoring", "escalated", "resolved"]
    assigned_to: str
    due_at: str | None = None
    is_stale: bool = False
    priority_label: Literal["low", "medium", "high", "critical"] = "low"
    priority_score: int = 0
    tags: list[str]
    analyst_notes: str
    updated_at: str
    history: list[InvestigationCaseHistoryEntry] = Field(default_factory=list)


class InvestigationCasesResponse(BaseModel):
    user_id: str
    cases: list[InvestigationCaseRecord]


GraphResponse.model_rebuild()
