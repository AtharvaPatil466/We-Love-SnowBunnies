from __future__ import annotations

from collections import Counter, defaultdict

import networkx as nx

from app.schemas import FraudRing, GraphEdge, GraphNode, GraphResponse, InvestigationSummaryResponse, NodeDetailResponse, NodeTransactionDetail, PredictionResponse, RingDetailResponse, RingMemberDetail, RingResponse, SenderProfile, TransactionPayload
from app.services.neo4j_service import Neo4jGraphRepository


class TransactionGraphService:
    def __init__(self) -> None:
        self.graph = nx.DiGraph()
        self.repository = Neo4jGraphRepository()
        self._seed_demo_graph()

    def _seed_demo_graph(self) -> None:
        seeded = [
            TransactionPayload(
                transaction_id="seed_1",
                sender_id="user_01",
                receiver_id="merchant_02",
                amount=4200,
                timestamp="2026-03-26T09:00:00Z",
                device_id="device_a1",
                product_type="UPI",
                email_domain="gmail.com",
                location="Mumbai",
            ),
            TransactionPayload(
                transaction_id="seed_2",
                sender_id="user_01",
                receiver_id="merchant_09",
                amount=6800,
                timestamp="2026-03-26T09:05:00Z",
                device_id="device_a1",
                product_type="UPI",
                email_domain="gmail.com",
                location="Mumbai",
            ),
            TransactionPayload(
                transaction_id="seed_3",
                sender_id="user_12",
                receiver_id="merchant_09",
                amount=7100,
                timestamp="2026-03-26T09:07:00Z",
                device_id="device_z8",
                product_type="CARD",
                email_domain="mail.xyz",
                location="Proxy",
            ),
        ]
        for txn in seeded:
            self.add_transaction(txn, PredictionResponse(
                transaction_id=txn.transaction_id,
                fraud_probability=0.72 if txn.transaction_id == "seed_3" else 0.38,
                risk_label="high" if txn.transaction_id == "seed_3" else "medium",
                contributing_factors=["Seeded for demo"],
            ))

    def sender_history_size(self, sender_id: str) -> int:
        return self.graph.out_degree(sender_id) if self.graph.has_node(sender_id) else 0

    def sender_profile(self, sender_id: str, receiver_id: str | None = None, device_id: str | None = None, pending_amount: float | None = None) -> SenderProfile:
        node = self.graph.nodes.get(sender_id, {})
        transaction_count = int(node.get("transaction_count", 0))
        total_amount = float(node.get("total_amount", 0.0))
        counterparties = set(node.get("counterparties", set()))
        devices = set(node.get("device_ids", set()))

        if receiver_id is not None:
            counterparties.add(receiver_id)
        if device_id is not None:
            devices.add(device_id)
        if pending_amount is not None:
            total_amount += pending_amount
            transaction_count += 1

        avg_amount = total_amount / transaction_count if transaction_count else 0.0
        return SenderProfile(
            sender_id=sender_id,
            transaction_count=transaction_count,
            avg_amount=avg_amount,
            unique_counterparties=len(counterparties),
            device_diversity=len(devices),
        )

    def add_transaction(self, payload: TransactionPayload, prediction: PredictionResponse) -> None:
        sender_node = self.graph.nodes.get(payload.sender_id, {})
        sender_transaction_count = int(sender_node.get("transaction_count", 0)) + 1
        sender_total_amount = float(sender_node.get("total_amount", 0.0)) + payload.amount
        sender_counterparties = set(sender_node.get("counterparties", set()))
        sender_counterparties.add(payload.receiver_id)
        sender_device_ids = set(sender_node.get("device_ids", set()))
        sender_device_ids.add(payload.device_id)

        self.graph.add_node(
            payload.sender_id,
            label=payload.sender_id,
            risk_score=max(prediction.fraud_probability, self.graph.nodes.get(payload.sender_id, {}).get("risk_score", 0.0)),
            transaction_count=sender_transaction_count,
            total_amount=sender_total_amount,
            avg_amount=sender_total_amount / sender_transaction_count,
            counterparties=sender_counterparties,
            device_ids=sender_device_ids,
            unique_counterparties=len(sender_counterparties),
            device_diversity=len(sender_device_ids),
        )
        receiver_node = self.graph.nodes.get(payload.receiver_id, {})
        self.graph.add_node(
            payload.receiver_id,
            label=payload.receiver_id,
            risk_score=max(prediction.fraud_probability * 0.75, self.graph.nodes.get(payload.receiver_id, {}).get("risk_score", 0.0)),
            transaction_count=int(receiver_node.get("transaction_count", 0)),
            total_amount=float(receiver_node.get("total_amount", 0.0)),
            avg_amount=float(receiver_node.get("avg_amount", 0.0)),
            counterparties=set(receiver_node.get("counterparties", set())),
            device_ids=set(receiver_node.get("device_ids", set())),
            unique_counterparties=int(receiver_node.get("unique_counterparties", 0)),
            device_diversity=int(receiver_node.get("device_diversity", 0)),
        )
        self.graph.add_edge(
            payload.sender_id,
            payload.receiver_id,
            transaction_id=payload.transaction_id,
            amount=payload.amount,
            timestamp=payload.timestamp,
            risk_score=prediction.fraud_probability,
        )
        self.repository.upsert_transaction(payload, prediction.fraud_probability)

    def user_subgraph(self, user_id: str) -> GraphResponse:
        if self.repository.enabled:
            persisted = self.repository.fetch_neighborhood(user_id)
            if persisted and persisted["nodes"]:
                return self._graph_response_from_records(user_id, persisted["nodes"], persisted["edges"])

        if not self.graph.has_node(user_id):
            self.graph.add_node(user_id, label=user_id, risk_score=0.0)

        neighborhood = {user_id}
        neighborhood.update(self.graph.predecessors(user_id))
        neighborhood.update(self.graph.successors(user_id))
        for node in list(neighborhood):
            neighborhood.update(self.graph.predecessors(node))
            neighborhood.update(self.graph.successors(node))

        subgraph = self.graph.subgraph(neighborhood).copy()
        communities = self._communities(subgraph)
        rings = self._fraud_rings(subgraph, communities)
        nodes = [
            GraphNode(
                id=node,
                label=subgraph.nodes[node].get("label", node),
                risk_score=round(subgraph.nodes[node].get("risk_score", 0.0), 4),
                community=communities.get(node, 0),
            )
            for node in subgraph.nodes
        ]
        edges = [
            GraphEdge(
                source=source,
                target=target,
                amount=data.get("amount", 0.0),
                timestamp=data.get("timestamp", ""),
                risk_score=round(data.get("risk_score", 0.0), 4),
            )
            for source, target, data in subgraph.edges(data=True)
        ]
        return GraphResponse(user_id=user_id, nodes=nodes, edges=edges, rings=rings)

    def rings_for_user(self, user_id: str) -> RingResponse:
        graph = self.user_subgraph(user_id)
        return RingResponse(user_id=user_id, rings=graph.rings)

    def rings_for_transaction(self, sender_id: str, receiver_id: str) -> list[str]:
        focus_nodes = {sender_id, receiver_id}
        neighbors = set(focus_nodes)
        for node in list(focus_nodes):
            if self.graph.has_node(node):
                neighbors.update(self.graph.predecessors(node))
                neighbors.update(self.graph.successors(node))
        subgraph = self.graph.subgraph(neighbors).copy()
        communities = self._communities(subgraph)
        rings = self._fraud_rings(subgraph, communities)
        return [
            ring.ring_id
            for ring in rings
            if focus_nodes.intersection(ring.node_ids)
        ]

    def node_detail(self, node_id: str) -> NodeDetailResponse:
        if not self.graph.has_node(node_id):
            self.graph.add_node(node_id, label=node_id, risk_score=0.0)

        neighborhood = self.user_subgraph(node_id)
        node_record = next((node for node in neighborhood.nodes if node.id == node_id), None)
        if node_record is None:
            node_record = GraphNode(id=node_id, label=node_id, risk_score=0.0, community=0)

        attrs = self.graph.nodes.get(node_id, {})
        transactions = []
        for source, target, data in self.graph.edges(data=True):
            if source != node_id and target != node_id:
                continue
            direction = "outgoing" if source == node_id else "incoming"
            counterparty = target if source == node_id else source
            transactions.append(
                NodeTransactionDetail(
                    transaction_id=str(data.get("transaction_id", f"{source}_{target}")),
                    source=source,
                    target=target,
                    amount=float(data.get("amount", 0.0)),
                    timestamp=str(data.get("timestamp", "")),
                    risk_score=round(float(data.get("risk_score", 0.0)), 4),
                    direction=direction,
                    counterparty=counterparty,
                )
            )

        transactions.sort(key=lambda item: item.timestamp, reverse=True)
        counterparties = sorted({txn.counterparty for txn in transactions})

        return NodeDetailResponse(
            node_id=node_record.id,
            label=node_record.label,
            risk_score=node_record.risk_score,
            community=node_record.community,
            transaction_count=int(attrs.get("transaction_count", len(transactions))),
            avg_amount=round(float(attrs.get("avg_amount", 0.0)), 2),
            unique_counterparties=int(attrs.get("unique_counterparties", len(counterparties))),
            device_diversity=int(attrs.get("device_diversity", 0)),
            total_amount=round(float(attrs.get("total_amount", sum(txn.amount for txn in transactions))), 2),
            counterparties=counterparties,
            recent_transactions=transactions[:8],
        )

    def ring_detail(self, ring_id: str) -> RingDetailResponse:
        try:
            community = int(ring_id.split("_")[-1])
        except ValueError:
            community = 0

        communities = self._communities(self.graph)
        node_ids = sorted([node for node, node_community in communities.items() if node_community == community])
        ring_graph = self.graph.subgraph(node_ids).copy()
        fraud_rings = self._fraud_rings(self.graph, communities)
        ring_record = next((ring for ring in fraud_rings if ring.ring_id == ring_id), None)

        if ring_record is None:
            ring_record = FraudRing(
                ring_id=ring_id,
                community=community,
                node_ids=node_ids,
                edge_count=ring_graph.number_of_edges(),
                avg_risk_score=0.0,
                total_amount=0.0,
                risk_label="medium",
            )

        transactions: list[NodeTransactionDetail] = []
        counterparties = set()
        for source, target, data in ring_graph.edges(data=True):
            counterparties.add(target)
            transactions.append(
                NodeTransactionDetail(
                    transaction_id=str(data.get("transaction_id", f"{source}_{target}")),
                    source=source,
                    target=target,
                    amount=float(data.get("amount", 0.0)),
                    timestamp=str(data.get("timestamp", "")),
                    risk_score=round(float(data.get("risk_score", 0.0)), 4),
                    direction="outgoing",
                    counterparty=target,
                )
            )

        transactions.sort(key=lambda item: item.timestamp, reverse=True)

        return RingDetailResponse(
            ring_id=ring_record.ring_id,
            community=ring_record.community,
            risk_label=ring_record.risk_label,
            avg_risk_score=ring_record.avg_risk_score,
            total_amount=ring_record.total_amount,
            edge_count=ring_record.edge_count,
            node_count=len(ring_record.node_ids),
            member_nodes=[
                RingMemberDetail(
                    node_id=node,
                    label=self.graph.nodes.get(node, {}).get("label", node),
                    risk_score=round(float(self.graph.nodes.get(node, {}).get("risk_score", 0.0)), 4),
                    community=community,
                )
                for node in ring_record.node_ids
            ],
            top_counterparties=sorted(counterparties)[:6],
            recent_transactions=transactions[:8],
        )

    def investigation_summary(
        self,
        user_id: str,
        ring_id: str | None = None,
        node_id: str | None = None,
    ) -> InvestigationSummaryResponse:
        ring_detail = self.ring_detail(ring_id) if ring_id else None
        node_detail = self.node_detail(node_id) if node_id else None

        risk_candidates = [
            node_detail.risk_score if node_detail else 0.0,
            ring_detail.avg_risk_score if ring_detail else 0.0,
        ]
        overall_risk = max(risk_candidates)
        if overall_risk >= 0.8:
            risk_label = "high"
        elif overall_risk >= 0.45:
            risk_label = "medium"
        else:
            risk_label = "low"

        headline_parts = ["Investigation summary"]
        if ring_id:
            headline_parts.append(f"for {ring_id}")
        if node_id:
            headline_parts.append(f"focused on {node_id}")
        headline = " ".join(headline_parts)

        observations: list[str] = []
        evidence = {
            "ring_nodes": ring_detail.node_count if ring_detail else 0,
            "ring_edges": ring_detail.edge_count if ring_detail else 0,
            "node_transactions": node_detail.transaction_count if node_detail else 0,
            "node_total_amount": node_detail.total_amount if node_detail else 0.0,
        }

        if ring_detail:
            observations.append(
                f"{ring_detail.node_count} entities are connected inside {ring_detail.ring_id} with {ring_detail.edge_count} observed internal payments."
            )
            observations.append(
                f"The ring carries an average risk score of {round(ring_detail.avg_risk_score * 100)}% and a monitored amount of Rs {round(ring_detail.total_amount):,}."
            )
            if ring_detail.top_counterparties:
                observations.append(
                    f"Frequent counterparties in this cluster include {', '.join(ring_detail.top_counterparties[:3])}."
                )

        if node_detail:
            observations.append(
                f"{node_detail.node_id} has {node_detail.transaction_count} linked transactions across {node_detail.unique_counterparties} counterparties."
            )
            observations.append(
                f"The node has moved Rs {round(node_detail.total_amount):,} with an average payment size of Rs {round(node_detail.avg_amount):,}."
            )
            if node_detail.device_diversity:
                observations.append(
                    f"Observed device diversity for this entity is {node_detail.device_diversity}, which can indicate account sharing or mule behavior when elevated."
                )

        if not observations:
            observations.append("No ring or node is selected yet, so the case summary is waiting for investigation context.")

        summary = " ".join(observations[:3])
        recommended_actions = [
            "Escalate the linked ring for analyst review if the same entities reappear in the next scoring cycle.",
            "Monitor the selected node for rapid follow-on payments or new counterparties.",
        ]
        if risk_label == "high":
            recommended_actions.insert(0, "Trigger an immediate customer alert and consider temporarily stepping up verification.")
        if ring_detail:
            recommended_actions.append("Export this case bundle and share it with the fraud ops team for ring-level follow-up.")

        return InvestigationSummaryResponse(
            user_id=user_id,
            ring_id=ring_id,
            node_id=node_id,
            risk_label=risk_label,
            headline=headline,
            summary=summary,
            key_observations=observations,
            recommended_actions=recommended_actions,
            evidence=evidence,
        )

    def _communities(self, graph: nx.Graph) -> dict[str, int]:
        if graph.number_of_nodes() <= 1:
            return {node: 0 for node in graph.nodes}
        undirected = graph.to_undirected()
        communities = list(nx.community.greedy_modularity_communities(undirected))
        mapping: dict[str, int] = {}
        for index, community in enumerate(communities):
            for node in community:
                mapping[str(node)] = index
        if not mapping:
            return {node: 0 for node in graph.nodes}
        missing = [str(node) for node in graph.nodes if str(node) not in mapping]
        for node in missing:
            mapping[str(node)] = 0
        return mapping

    def _fraud_rings(self, graph: nx.DiGraph, communities: dict[str, int]) -> list[FraudRing]:
        members_by_community: dict[int, list[str]] = defaultdict(list)
        for node, community in communities.items():
            members_by_community[community].append(node)

        rings: list[FraudRing] = []
        for community, node_ids in members_by_community.items():
            if len(node_ids) < 2:
                continue
            ring_graph = graph.subgraph(node_ids).copy()
            risk_values = [float(graph.nodes[node].get("risk_score", 0.0)) for node in node_ids]
            edge_amounts = [float(data.get("amount", 0.0)) for _, _, data in ring_graph.edges(data=True)]
            avg_risk = sum(risk_values) / len(risk_values)
            total_amount = sum(edge_amounts)
            if avg_risk < 0.45 and total_amount < 10000:
                continue
            risk_label = "high" if avg_risk >= 0.75 else "medium"
            rings.append(
                FraudRing(
                    ring_id=f"ring_{community}",
                    community=community,
                    node_ids=sorted(node_ids),
                    edge_count=ring_graph.number_of_edges(),
                    avg_risk_score=round(avg_risk, 4),
                    total_amount=round(total_amount, 2),
                    risk_label=risk_label,
                )
            )

        rings.sort(key=lambda ring: (ring.avg_risk_score, ring.total_amount), reverse=True)
        return rings

    def _graph_response_from_records(self, user_id: str, node_records: list[dict], edge_records: list[dict]) -> GraphResponse:
        graph = nx.DiGraph()
        for node in node_records:
            graph.add_node(
                node["id"],
                label=node.get("label", node["id"]),
                risk_score=float(node.get("risk_score", 0.0)),
            )
        for edge in edge_records:
            graph.add_edge(
                edge["source"],
                edge["target"],
                amount=float(edge.get("amount", 0.0)),
                timestamp=edge.get("timestamp", ""),
                risk_score=float(edge.get("risk_score", 0.0)),
            )
        communities = self._communities(graph)
        rings = self._fraud_rings(graph, communities)
        nodes = [
            GraphNode(
                id=node,
                label=graph.nodes[node].get("label", node),
                risk_score=round(graph.nodes[node].get("risk_score", 0.0), 4),
                community=communities.get(node, 0),
            )
            for node in graph.nodes
        ]
        edges = [
            GraphEdge(
                source=source,
                target=target,
                amount=data.get("amount", 0.0),
                timestamp=data.get("timestamp", ""),
                risk_score=round(data.get("risk_score", 0.0), 4),
            )
            for source, target, data in graph.edges(data=True)
        ]
        return GraphResponse(user_id=user_id, nodes=nodes, edges=edges, rings=rings)
