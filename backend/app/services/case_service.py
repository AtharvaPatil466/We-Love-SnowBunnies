from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.schemas import InvestigationCaseHistoryEntry, InvestigationCaseRecord, InvestigationCasesResponse, InvestigationCaseUpsertPayload


class InvestigationCaseService:
    def __init__(self) -> None:
        self._cases: list[InvestigationCaseRecord] = []

    def _default_due_at(self, status: str, timestamp: datetime) -> str | None:
        if status == "resolved":
            return None
        hours = 4 if status == "escalated" else 24 if status == "open" else 48
        return (timestamp + timedelta(hours=hours)).isoformat()

    def _is_stale(self, status: str, due_at: str | None, timestamp: datetime) -> bool:
        if status == "resolved" or not due_at:
            return False
        try:
            due = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        return due < timestamp

    def _priority(self, status: str, is_stale: bool, due_at: str | None) -> tuple[str, int]:
        score = 10
        if status == "monitoring":
            score = 35
        elif status == "open":
            score = 45
        elif status == "escalated":
            score = 70
        elif status == "resolved":
            score = 5

        if due_at:
            score += 5
        if is_stale:
            score += 25

        if score >= 85:
            return ("critical", score)
        if score >= 65:
            return ("high", score)
        if score >= 35:
            return ("medium", score)
        return ("low", score)

    def upsert(self, payload: InvestigationCaseUpsertPayload) -> InvestigationCaseRecord:
        now = datetime.now(UTC)
        timestamp = now.isoformat()
        existing = next(
            (
                case
                for case in self._cases
                if case.user_id == payload.user_id
                and case.ring_id == payload.ring_id
                and case.node_id == payload.node_id
            ),
            None,
        )

        history = list(existing.history) if existing else []
        history.insert(
            0,
            InvestigationCaseHistoryEntry(
                status=payload.status,
                assigned_to=payload.assigned_to,
                due_at=payload.due_at or self._default_due_at(payload.status, now),
                analyst_notes=payload.analyst_notes,
                tags=payload.tags,
                updated_at=timestamp,
            ),
        )

        due_at = payload.due_at or (existing.due_at if existing and existing.status == payload.status else self._default_due_at(payload.status, now))

        is_stale = self._is_stale(payload.status, due_at, now)
        priority_label, priority_score = self._priority(payload.status, is_stale, due_at)

        record = InvestigationCaseRecord(
            case_id=existing.case_id if existing else f"case_{uuid4().hex[:10]}",
            user_id=payload.user_id,
            ring_id=payload.ring_id,
            node_id=payload.node_id,
            title=payload.title,
            status=payload.status,
            assigned_to=payload.assigned_to,
            due_at=due_at,
            is_stale=is_stale,
            priority_label=priority_label,
            priority_score=priority_score,
            tags=payload.tags,
            analyst_notes=payload.analyst_notes,
            updated_at=timestamp,
            history=history[:12],
        )

        if existing:
            self._cases = [record if case.case_id == existing.case_id else case for case in self._cases]
        else:
            self._cases.insert(0, record)

        self._cases = self._cases[:50]
        return record

    def list_for_user(
        self,
        user_id: str,
        status: str | None = None,
        assigned_to: str | None = None,
        stale_only: bool = False,
    ) -> InvestigationCasesResponse:
        cases = [case for case in self._cases if case.user_id == user_id]
        if status:
            cases = [case for case in cases if case.status == status]
        if assigned_to:
            cases = [case for case in cases if case.assigned_to == assigned_to]
        if stale_only:
            cases = [case for case in cases if case.is_stale]
        cases.sort(key=lambda case: (case.priority_score, case.updated_at), reverse=True)
        return InvestigationCasesResponse(user_id=user_id, cases=cases)
