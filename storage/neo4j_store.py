"""
Neo4j knowledge graph storage implementation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from neo4j import AsyncGraphDatabase, AsyncDriver

from core.models import (
    Entity,
    EntityType,
    Relation,
    RelationType,
)
from storage.interfaces import GraphStore

logger = logging.getLogger(__name__)


class Neo4jGraphStore(GraphStore):
    """Neo4j-backed knowledge graph storage."""

    def __init__(self, uri: str, user: str, password: str, database: str = "neo4j"):
        self._driver: Optional[AsyncDriver] = None
        self._uri = uri
        self._user = user
        self._password = password
        self._database = database

    @property
    def driver(self) -> AsyncDriver:
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self._uri, auth=(self._user, self._password)
            )
        return self._driver

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def _ensure_constraints(self):
        """Create uniqueness constraints."""
        async with self.driver.session(database=self._database) as session:
            await session.run("""
                CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
                FOR (e:Entity) REQUIRE e.id IS UNIQUE;
            """)
            await session.run("""
                CREATE CONSTRAINT entity_name_type_unique IF NOT EXISTS
                FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE;
            """)
            logger.info("Neo4j constraints initialized.")

    @staticmethod
    def _record_to_entity(record) -> Entity:
        import json
        node = record["e"]
        props = dict(node)
        # Convert Neo4j DateTime to Python datetime
        created = props.get("created_at")
        updated = props.get("updated_at")
        if hasattr(created, "to_native"):
            created = created.to_native()
        if hasattr(updated, "to_native"):
            updated = updated.to_native()
        # Deserialize properties if stored as JSON string
        raw_props = props.get("properties", {})
        if isinstance(raw_props, str):
            try:
                raw_props = json.loads(raw_props)
            except (json.JSONDecodeError, TypeError):
                raw_props = {}
        return Entity(
            id=props.get("id", ""),
            name=props.get("name", ""),
            entity_type=EntityType(props.get("type", "Concept")),
            description=props.get("description", ""),
            properties=raw_props,
            confidence=float(props.get("confidence", 1.0)),
            created_at=created or datetime.now(timezone.utc),
            updated_at=updated or datetime.now(timezone.utc),
            source_memory_ids=props.get("source_memory_ids", []),
        )

    @staticmethod
    def _record_to_relation(record) -> Relation:
        rel = record["r"]
        src = record["src"]
        tgt = record["tgt"]
        props = dict(rel)
        return Relation(
            id=props.get("id", ""),
            source_entity_id=src.get("id", ""),
            target_entity_id=tgt.get("id", ""),
            relation_type=RelationType(props.get("type", "RELATED_TO")),
            description=props.get("description", ""),
            confidence=float(props.get("confidence", 1.0)),
            inferred=bool(props.get("inferred", False)),
            created_at=props.get("created_at", datetime.now(timezone.utc)),
            source_memory_ids=props.get("source_memory_ids", []),
        )

    # ── Entity CRUD ────────────────────────────

    async def create_entity(self, entity: Entity) -> str:
        # Neo4j only accepts primitive property values — serialize complex types
        import json
        serialized_props = json.dumps(entity.properties) if entity.properties else "{}"
        async with self.driver.session(database=self._database) as session:
            result = await session.run("""
                MERGE (e:Entity {name: $name, type: $type})
                ON CREATE SET
                    e.id = $id,
                    e.description = $description,
                    e.properties = $properties,
                    e.confidence = $confidence,
                    e.created_at = $created_at,
                    e.updated_at = $updated_at,
                    e.source_memory_ids = $source_memory_ids
                ON MATCH SET
                    e.description = CASE WHEN $description <> ''
                        THEN $description ELSE e.description END,
                    e.confidence = CASE WHEN $confidence > COALESCE(e.confidence, 0)
                        THEN $confidence ELSE e.confidence END,
                    e.updated_at = $updated_at
                RETURN e.id;
            """, {
                "id": entity.id,
                "name": entity.name,
                "type": entity.entity_type.value,
                "description": entity.description,
                "properties": serialized_props,
                "confidence": entity.confidence,
                "created_at": entity.created_at,
                "updated_at": entity.updated_at,
                "source_memory_ids": entity.source_memory_ids,
            })
            record = await result.single()
            return record["e.id"] if record else entity.id

    async def create_relation(self, relation: Relation) -> str:
        async with self.driver.session(database=self._database) as session:
            result = await session.run("""
                MATCH (src:Entity {id: $source_id})
                MATCH (tgt:Entity {id: $target_id})
                MERGE (src)-[r:RELATES {id: $id}]->(tgt)
                ON CREATE SET
                    r.type = $type,
                    r.description = $description,
                    r.confidence = $confidence,
                    r.inferred = $inferred,
                    r.created_at = $created_at,
                    r.source_memory_ids = $source_memory_ids
                ON MATCH SET
                    r.confidence = CASE WHEN $confidence > COALESCE(r.confidence, 0)
                        THEN $confidence ELSE r.confidence END
                RETURN r.id;
            """, {
                "id": relation.id,
                "source_id": relation.source_entity_id,
                "target_id": relation.target_entity_id,
                "type": relation.relation_type.value,
                "description": relation.description,
                "confidence": relation.confidence,
                "inferred": relation.inferred,
                "created_at": relation.created_at,
                "source_memory_ids": relation.source_memory_ids,
            })
            record = await result.single()
            return record["r.id"] if record else relation.id

    async def get_entity(self, entity_id: str) -> Optional[Entity]:
        async with self.driver.session(database=self._database) as session:
            result = await session.run("""
                MATCH (e:Entity {id: $id}) RETURN e;
            """, {"id": entity_id})
            record = await result.single()
            return self._record_to_entity(record) if record else None

    async def search_entities(
        self, query: str, entity_type: Optional[EntityType] = None, top_k: int = 10
    ) -> list[Entity]:
        type_filter = f"AND e.type = '{entity_type.value}'" if entity_type else ""
        async with self.driver.session(database=self._database) as session:
            result = await session.run(f"""
                MATCH (e:Entity)
                WHERE (toLower(e.name) CONTAINS toLower($query)
                       OR toLower(e.description) CONTAINS toLower($query))
                {type_filter}
                RETURN e
                ORDER BY e.confidence DESC
                LIMIT $top_k;
            """, {"query": query, "top_k": top_k})
            return [self._record_to_entity(r) for r in await result.fetch(top_k)]

    async def find_similar_entities(self, name: str, threshold: float = 0.85) -> list[Entity]:
        """Find entities with similar names using Levenshtein via APOC."""
        async with self.driver.session(database=self._database) as session:
            try:
                result = await session.run("""
                    MATCH (e:Entity)
                    WHERE apoc.text.levenshteinSimilarity(toLower(e.name), toLower($name)) > $threshold
                    RETURN e
                    ORDER BY apoc.text.levenshteinSimilarity(toLower(e.name), toLower($name)) DESC
                    LIMIT 10;
                """, {"name": name, "threshold": threshold})
                return [self._record_to_entity(r) for r in await result.fetch(10)]
            except Exception:
                # APOC might not be available; fallback to exact match
                result = await session.run("""
                    MATCH (e:Entity {name: $name}) RETURN e;
                """, {"name": name})
                return [self._record_to_entity(r) for r in await result.fetch(10)]

    async def merge_entities(self, keep_id: str, merge_id: str) -> str:
        """Merge merge_id into keep_id, transferring all relations."""
        async with self.driver.session(database=self._database) as session:
            await session.run("""
                MATCH (keep:Entity {id: $keep_id})
                MATCH (merge:Entity {id: $merge_id})
                // Transfer all incoming relations to keep
                MATCH (other)-[r_in]->(merge)
                WHERE other.id <> $keep_id
                MERGE (other)-[new_r:RELATES]->(keep)
                SET new_r = properties(r_in),
                    new_r.id = r_in.id + '_merged'
                // Transfer all outgoing relations to keep
                MATCH (merge)-[r_out]->(other2)
                WHERE other2.id <> $keep_id
                MERGE (keep)-[new_r2:RELATES]->(other2)
                SET new_r2 = properties(r_out),
                    new_r2.id = r_out.id + '_merged'
                // Delete all relations on merge
                DETACH DELETE merge;
            """, {"keep_id": keep_id, "merge_id": merge_id})
            return keep_id

    async def get_neighbors(
        self, entity_id: str, depth: int = 1,
        relation_types: Optional[list[RelationType]] = None
    ) -> list[tuple[Entity, Relation]]:
        type_filter = ""
        if relation_types:
            types_str = "|".join(rt.value for rt in relation_types)
            type_filter = f"WHERE type(r) IN [{types_str}]"

        async with self.driver.session(database=self._database) as session:
            result = await session.run(f"""
                MATCH (e:Entity {{id: $id}})-[r:RELATES]-(neighbor:Entity)
                {type_filter}
                RETURN neighbor AS e, r, e AS src, neighbor AS tgt
                LIMIT 50;
            """, {"id": entity_id})
            neighbors = []
            async for record in result:
                entity = self._record_to_entity(record)
                # Build a pseudo relation
                rel_data = dict(record["r"])
                rel = Relation(
                    id=rel_data.get("id", ""),
                    source_entity_id=entity_id,
                    target_entity_id=entity.id,
                    relation_type=RelationType(rel_data.get("type", "RELATED_TO")),
                    description=rel_data.get("description", ""),
                    confidence=float(rel_data.get("confidence", 1.0)),
                    inferred=bool(rel_data.get("inferred", False)),
                )
                neighbors.append((entity, rel))
            return neighbors

    async def get_connections_between(
        self, entity_id_1: str, entity_id_2: str
    ) -> list[Relation]:
        async with self.driver.session(database=self._database) as session:
            result = await session.run("""
                MATCH (e1:Entity {id: $id1})-[r:RELATES]-(e2:Entity {id: $id2})
                RETURN r, e1 AS src, e2 AS tgt;
            """, {"id1": entity_id_1, "id2": entity_id_2})
            return [self._record_to_relation(r) for r in await result.fetch(10)]

    async def infer_transitive_relations(self) -> list[Relation]:
        """Infer transitive relations.
        If A USES B and B USES C, then A USES C (with lower confidence).
        If A PART_OF B and B PART_OF C, then A PART_OF C.
        """
        inferred = []
        async with self.driver.session(database=self._database) as session:
            # Transitive USES
            result = await session.run("""
                MATCH (a:Entity)-[r1:RELATES]->(b:Entity)-[r2:RELATES]->(c:Entity)
                WHERE r1.type = 'USES' AND r2.type = 'USES'
                  AND NOT EXISTS((a)-[:RELATES {type: 'USES'}]->(c))
                  AND a.id <> c.id
                RETURN a, b, c, r1, r2
                LIMIT 20;
            """)
            async for record in result:
                a = dict(record["a"])
                c = dict(record["c"])
                r1 = dict(record["r1"])
                r2 = dict(record["r2"])
                conf = float(r1.get("confidence", 1.0)) * float(r2.get("confidence", 1.0)) * 0.7
                rel = Relation(
                    source_entity_id=a["id"],
                    target_entity_id=c["id"],
                    relation_type=RelationType.USES,
                    description=f"Inferred: {a.get('name','')} uses {c.get('name','')} (via {dict(record['b']).get('name','')})",
                    confidence=conf,
                    inferred=True,
                )
                inferred.append(rel)

            # Transitive PART_OF
            result = await session.run("""
                MATCH (a:Entity)-[r1:RELATES]->(b:Entity)-[r2:RELATES]->(c:Entity)
                WHERE r1.type = 'PART_OF' AND r2.type = 'PART_OF'
                  AND NOT EXISTS((a)-[:RELATES {type: 'PART_OF'}]->(c))
                  AND a.id <> c.id
                RETURN a, b, c, r1, r2
                LIMIT 20;
            """)
            async for record in result:
                a = dict(record["a"])
                c = dict(record["c"])
                r1 = dict(record["r1"])
                r2 = dict(record["r2"])
                conf = float(r1.get("confidence", 1.0)) * float(r2.get("confidence", 1.0)) * 0.7
                rel = Relation(
                    source_entity_id=a["id"],
                    target_entity_id=c["id"],
                    relation_type=RelationType.PART_OF,
                    description=f"Inferred: {a.get('name','')} part of {c.get('name','')}",
                    confidence=conf,
                    inferred=True,
                )
                inferred.append(rel)

        return inferred

    async def delete_entity(self, entity_id: str) -> bool:
        async with self.driver.session(database=self._database) as session:
            result = await session.run("""
                MATCH (e:Entity {id: $id})
                DETACH DELETE e
                RETURN COUNT(e) AS deleted;
            """, {"id": entity_id})
            record = await result.single()
            return record and record["deleted"] > 0


async def create_graph_store(config: dict) -> Neo4jGraphStore:
    """Factory: create Neo4jGraphStore from config."""
    neo4j_cfg = config.get("storage", {}).get("neo4j", {})
    store = Neo4jGraphStore(
        uri=neo4j_cfg.get("uri", "bolt://localhost:7687"),
        user=neo4j_cfg.get("user", "neo4j"),
        password=neo4j_cfg.get("password", "deepspace123"),
        database=neo4j_cfg.get("database", "neo4j"),
    )
    await store._ensure_constraints()
    return store