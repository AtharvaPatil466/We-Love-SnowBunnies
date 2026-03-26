from __future__ import annotations

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover
    GraphDatabase = None

from app.core.settings import settings
from app.schemas import TransactionPayload


class Neo4jGraphRepository:
    def __init__(self) -> None:
        self.enabled = False
        self.driver = None

        if not settings.neo4j_enabled or GraphDatabase is None:
            return
        try:
            self.driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_username, settings.neo4j_password),
            )
            self.driver.verify_connectivity()
            self._bootstrap_schema()
            self.enabled = True
        except Exception:
            self.driver = None
            self.enabled = False

    def upsert_transaction(self, payload: TransactionPayload, fraud_probability: float) -> None:
        if not self.enabled or self.driver is None:
            return
        with self.driver.session() as session:
            session.execute_write(
                self._upsert_transaction_tx,
                payload.model_dump(),
                fraud_probability,
            )

    def fetch_neighborhood(self, user_id: str) -> dict[str, list[dict]] | None:
        if not self.enabled or self.driver is None:
            return None
        with self.driver.session() as session:
            result = session.execute_read(self._fetch_neighborhood_tx, user_id)
            return result

    @staticmethod
    def _upsert_transaction_tx(tx, payload: dict, fraud_probability: float) -> None:
        tx.run(
            """
            MERGE (s:Account {id: $sender_id})
            ON CREATE SET s.label = $sender_id
            SET s.risk_score = CASE
                WHEN s.risk_score IS NULL OR s.risk_score < $fraud_probability THEN $fraud_probability
                ELSE s.risk_score
            END

            MERGE (r:Account {id: $receiver_id})
            ON CREATE SET r.label = $receiver_id
            SET r.risk_score = CASE
                WHEN r.risk_score IS NULL OR r.risk_score < ($fraud_probability * 0.75) THEN ($fraud_probability * 0.75)
                ELSE r.risk_score
            END

            MERGE (s)-[t:TRANSACTS {transaction_id: $transaction_id}]->(r)
            SET t.amount = $amount,
                t.timestamp = $timestamp,
                t.device_id = $device_id,
                t.product_type = $product_type,
                t.location = $location,
                t.risk_score = $fraud_probability
            """,
            **payload,
            fraud_probability=fraud_probability,
        )

    @staticmethod
    def _fetch_neighborhood_tx(tx, user_id: str) -> dict[str, list[dict]]:
        result = tx.run(
            """
            MATCH (center:Account {id: $user_id})
            OPTIONAL MATCH (center)-[:TRANSACTS*1..2]-(neighbor:Account)
            WITH center, collect(DISTINCT neighbor) + [center] AS node_candidates
            UNWIND node_candidates AS node
            WITH collect(DISTINCT node) AS distinct_nodes
            UNWIND distinct_nodes AS node
            OPTIONAL MATCH (node)-[rel:TRANSACTS]-(other:Account)
            WHERE other IN distinct_nodes
            WITH distinct_nodes, collect(DISTINCT rel) AS distinct_rels
            RETURN
                [node IN distinct_nodes | {
                    id: node.id,
                    label: coalesce(node.label, node.id),
                    risk_score: coalesce(node.risk_score, 0.0)
                }] AS nodes,
                [rel IN distinct_rels | {
                    source: startNode(rel).id,
                    target: endNode(rel).id,
                    amount: coalesce(rel.amount, 0.0),
                    timestamp: coalesce(rel.timestamp, ""),
                    risk_score: coalesce(rel.risk_score, 0.0)
                }] AS edges
            """,
            user_id=user_id,
        ).single()
        if result is None:
            return {"nodes": [], "edges": []}
        return {"nodes": result["nodes"], "edges": result["edges"]}

    def _bootstrap_schema(self) -> None:
        if self.driver is None:
            return
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT account_id_unique IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE")
            session.run("CREATE INDEX account_risk_score IF NOT EXISTS FOR (a:Account) ON (a.risk_score)")
            session.run("CREATE INDEX transaction_timestamp IF NOT EXISTS FOR ()-[t:TRANSACTS]-() ON (t.timestamp)")
            session.run("CREATE INDEX transaction_risk_score IF NOT EXISTS FOR ()-[t:TRANSACTS]-() ON (t.risk_score)")

    def close(self) -> None:
        if self.driver is not None:
            self.driver.close()
