"""
PostgreSQL + pgvector storage implementation.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2 import sql

from core.models import (
    Memory,
    MemoryLayer,
    MemoryType,
    ProjectContext,
)
from storage.interfaces import RelationalStore, VectorStore

logger = logging.getLogger(__name__)


class PgVectorStore(RelationalStore, VectorStore):
    """PostgreSQL with pgvector extension for both relational and vector storage."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5440,
        database: str = "deepspace",
        user: str = "deepspace",
        password: str = "deepspace",
    ):
        self.conn_params = {
            "host": host,
            "port": port,
            "dbname": database,
            "user": user,
            "password": password,
        }
        self._conn: Optional[psycopg2.extensions.connection] = None

    @property
    def conn(self) -> psycopg2.extensions.connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(**self.conn_params)
            self._conn.autocommit = True
        return self._conn

    # ── Schema ────────────────────────────────

    async def init_schema(self) -> None:
        """Create tables and indexes."""
        with self.conn.cursor() as cur:
            # Enable pgvector
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")  # For fuzzy text search

            # Memories table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    summary TEXT DEFAULT '',
                    layer TEXT NOT NULL DEFAULT 'short_term',
                    memory_type TEXT NOT NULL DEFAULT 'fact',
                    importance REAL DEFAULT 0.5,
                    confidence REAL DEFAULT 1.0,
                    project TEXT DEFAULT '',
                    tags JSONB DEFAULT '[]',
                    source TEXT DEFAULT '',
                    embedding vector(1024),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    last_accessed TIMESTAMPTZ DEFAULT NOW(),
                    access_count INTEGER DEFAULT 0,
                    ttl_days INTEGER DEFAULT 0,
                    related_ids JSONB DEFAULT '[]',
                    metadata JSONB DEFAULT '{}'
                );
            """)

            # Project contexts
            cur.execute("""
                CREATE TABLE IF NOT EXISTS project_contexts (
                    name TEXT PRIMARY KEY,
                    path TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    tech_stack JSONB DEFAULT '[]',
                    key_files JSONB DEFAULT '[]',
                    current_task TEXT DEFAULT '',
                    open_issues JSONB DEFAULT '[]',
                    recent_decisions JSONB DEFAULT '[]',
                    last_active TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            # Execution history
            cur.execute("""
                CREATE TABLE IF NOT EXISTS execution_history (
                    id SERIAL PRIMARY KEY,
                    goal TEXT NOT NULL,
                    outcome TEXT NOT NULL DEFAULT 'pending',
                    steps_total INTEGER DEFAULT 0,
                    steps_passed INTEGER DEFAULT 0,
                    details JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            # Indexes
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed);
            """)
            # Trgm index for fuzzy text search
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_content_trgm
                ON memories USING gin (content gin_trgm_ops);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin (tags);
            """)

            # Vector indexes — IVFFlat for fast approximate search
            # We create this after data exists, but define it here
            logger.info("Database schema initialized.")

    async def _ensure_vector_index(self) -> None:
        """Create IVFFlat index on embedding column (requires data to exist first)."""
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM pg_indexes
                WHERE indexname = 'idx_memories_embedding_ivfflat';
            """)
            if cur.fetchone()[0] == 0:
                try:
                    cur.execute("""
                        CREATE INDEX idx_memories_embedding_ivfflat
                        ON memories USING ivfflat (embedding vector_cosine_ops)
                        WITH (lists = 100);
                    """)
                    logger.info("Created IVFFlat index on embeddings.")
                except Exception as e:
                    logger.warning(f"Could not create IVFFlat index (may need data first): {e}")

    # ── RelationalStore ────────────────────────

    @staticmethod
    def _row_to_memory(row: dict) -> Memory:
        """Convert a database row to a Memory object."""
        # Parse embedding — pgvector returns as string representation
        raw_embedding = row.get("embedding")
        embedding = None
        if raw_embedding is not None:
            if isinstance(raw_embedding, str):
                try:
                    embedding = [float(x) for x in raw_embedding.strip("[]").split(",")]
                except (ValueError, AttributeError):
                    embedding = None
            elif isinstance(raw_embedding, list):
                embedding = raw_embedding
        return Memory(
            id=row["id"],
            content=row["content"],
            summary=row.get("summary", ""),
            layer=MemoryLayer(row.get("layer", "short_term")),
            memory_type=MemoryType(row.get("memory_type", "fact")),
            importance=float(row.get("importance", 0.5)),
            confidence=float(row.get("confidence", 1.0)),
            project=row.get("project", ""),
            tags=json.loads(row.get("tags", "[]")) if isinstance(row.get("tags"), str) else (row.get("tags") or []),
            source=row.get("source", ""),
            embedding=embedding,
            created_at=row.get("created_at", datetime.now(timezone.utc)),
            last_accessed=row.get("last_accessed", datetime.now(timezone.utc)),
            access_count=int(row.get("access_count", 0)),
            ttl_days=int(row.get("ttl_days", 0)),
            related_ids=json.loads(row.get("related_ids", "[]")) if isinstance(row.get("related_ids"), str) else (row.get("related_ids") or []),
            metadata=json.loads(row.get("metadata", "{}")) if isinstance(row.get("metadata"), str) else (row.get("metadata") or {}),
        )

    async def save_memory(self, memory: Memory) -> str:
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO memories (id, content, summary, layer, memory_type,
                    importance, confidence, project, tags, source, embedding,
                    created_at, last_accessed, access_count, ttl_days,
                    related_ids, metadata)
                VALUES (%(id)s, %(content)s, %(summary)s, %(layer)s, %(memory_type)s,
                    %(importance)s, %(confidence)s, %(project)s, %(tags)s, %(source)s,
                    %(embedding)s, %(created_at)s, %(last_accessed)s,
                    %(access_count)s, %(ttl_days)s, %(related_ids)s, %(metadata)s)
                ON CONFLICT (id) DO UPDATE SET
                    content = EXCLUDED.content,
                    summary = EXCLUDED.summary,
                    layer = EXCLUDED.layer,
                    importance = EXCLUDED.importance,
                    confidence = EXCLUDED.confidence,
                    embedding = EXCLUDED.embedding,
                    last_accessed = EXCLUDED.last_accessed,
                    access_count = EXCLUDED.access_count,
                    metadata = EXCLUDED.metadata;
            """, {
                "id": memory.id,
                "content": memory.content,
                "summary": memory.summary,
                "layer": memory.layer.value,
                "memory_type": memory.memory_type.value,
                "importance": memory.importance,
                "confidence": memory.confidence,
                "project": memory.project,
                "tags": json.dumps(memory.tags),
                "source": memory.source,
                "embedding": memory.embedding,
                "created_at": memory.created_at,
                "last_accessed": memory.last_accessed,
                "access_count": memory.access_count,
                "ttl_days": memory.ttl_days,
                "related_ids": json.dumps(memory.related_ids),
                "metadata": json.dumps(memory.metadata),
            })
            return memory.id

    async def save_memories_batch(self, memories: list[Memory]) -> list[str]:
        ids = []
        for m in memories:
            ids.append(await self.save_memory(m))
        return ids

    async def get_memory(self, memory_id: str) -> Optional[Memory]:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM memories WHERE id = %s;", (memory_id,))
            row = cur.fetchone()
            if row:
                return self._row_to_memory(dict(row))
        return None

    async def search_memories(
        self,
        query: str,
        layer: Optional[MemoryLayer] = None,
        memory_type: Optional[MemoryType] = None,
        project: Optional[str] = None,
        tags: Optional[list[str]] = None,
        top_k: int = 10,
    ) -> list[Memory]:
        """Keyword/text search using PostgreSQL full-text search + trigram."""
        conditions = []
        params: dict = {"limit": top_k}

        # Use similarity search with pg_trgm
        conditions.append("similarity(content, %(query)s) > 0.1")
        params["query"] = query

        if layer:
            conditions.append("layer = %(layer)s")
            params["layer"] = layer.value
        if memory_type:
            conditions.append("memory_type = %(memory_type)s")
            params["memory_type"] = memory_type.value
        if project:
            conditions.append("project = %(project)s")
            params["project"] = project
        if tags:
            conditions.append("tags ?| %(tags)s")
            params["tags"] = tags

        where = " AND ".join(conditions)
        sql_query = f"""
            SELECT *, similarity(content, %(query)s) AS sim
            FROM memories
            WHERE {where}
            ORDER BY sim DESC, importance DESC
            LIMIT %(limit)s;
        """

        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql_query, params)
            rows = cur.fetchall()
            return [self._row_to_memory(dict(r)) for r in rows]

    async def update_layer(self, memory_ids: list[str], new_layer: MemoryLayer) -> int:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE memories SET layer = %s WHERE id = ANY(%s);
            """, (new_layer.value, memory_ids))
            return cur.rowcount

    async def get_by_layer(self, layer: MemoryLayer, limit: int = 100, offset: int = 0) -> list[Memory]:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM memories
                WHERE layer = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s;
            """, (layer.value, limit, offset))
            return [self._row_to_memory(dict(r)) for r in cur.fetchall()]

    async def get_stale_memories(self, layer: MemoryLayer, days: int) -> list[Memory]:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM memories
                WHERE layer = %s
                  AND last_accessed < NOW() - INTERVAL '%s days'
                ORDER BY last_accessed ASC
                LIMIT 500;
            """, (layer.value, days))
            return [self._row_to_memory(dict(r)) for r in cur.fetchall()]

    async def touch(self, memory_ids: list[str]) -> None:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE memories
                SET last_accessed = NOW(),
                    access_count = access_count + 1
                WHERE id = ANY(%s);
            """, (memory_ids,))

    async def delete_memories(self, memory_ids: list[str]) -> int:
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM memories WHERE id = ANY(%s);", (memory_ids,))
            return cur.rowcount

    # ── Project Context ────────────────────────

    async def save_project_context(self, ctx: ProjectContext) -> str:
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO project_contexts (name, path, description, tech_stack,
                    key_files, current_task, open_issues, recent_decisions, last_active)
                VALUES (%(name)s, %(path)s, %(description)s, %(tech_stack)s,
                    %(key_files)s, %(current_task)s, %(open_issues)s,
                    %(recent_decisions)s, %(last_active)s)
                ON CONFLICT (name) DO UPDATE SET
                    path = EXCLUDED.path,
                    description = EXCLUDED.description,
                    tech_stack = EXCLUDED.tech_stack,
                    key_files = EXCLUDED.key_files,
                    current_task = EXCLUDED.current_task,
                    open_issues = EXCLUDED.open_issues,
                    recent_decisions = EXCLUDED.recent_decisions,
                    last_active = EXCLUDED.last_active;
            """, {
                "name": ctx.name,
                "path": ctx.path,
                "description": ctx.description,
                "tech_stack": json.dumps(ctx.tech_stack),
                "key_files": json.dumps(ctx.key_files),
                "current_task": ctx.current_task,
                "open_issues": json.dumps(ctx.open_issues),
                "recent_decisions": json.dumps(ctx.recent_decisions),
                "last_active": ctx.last_active,
            })
            return ctx.name

    async def get_project_context(self, name: str) -> Optional[ProjectContext]:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM project_contexts WHERE name = %s;", (name,))
            row = cur.fetchone()
            if row:
                r = dict(row)
                return ProjectContext(
                    name=r["name"],
                    path=r["path"],
                    description=r.get("description", ""),
                    tech_stack=json.loads(r.get("tech_stack", "[]")) if isinstance(r.get("tech_stack"), str) else (r.get("tech_stack") or []),
                    key_files=json.loads(r.get("key_files", "[]")) if isinstance(r.get("key_files"), str) else (r.get("key_files") or []),
                    current_task=r.get("current_task", ""),
                    open_issues=json.loads(r.get("open_issues", "[]")) if isinstance(r.get("open_issues"), str) else (r.get("open_issues") or []),
                    recent_decisions=json.loads(r.get("recent_decisions", "[]")) if isinstance(r.get("recent_decisions"), str) else (r.get("recent_decisions") or []),
                    last_active=r.get("last_active", datetime.now(timezone.utc)),
                )
        return None

    async def list_projects(self) -> list[ProjectContext]:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM project_contexts ORDER BY last_active DESC;")
            results = []
            for row in cur.fetchall():
                r = dict(row)
                results.append(ProjectContext(
                    name=r["name"],
                    path=r["path"],
                    description=r.get("description", ""),
                    tech_stack=json.loads(r.get("tech_stack", "[]")) if isinstance(r.get("tech_stack"), str) else (r.get("tech_stack") or []),
                    key_files=json.loads(r.get("key_files", "[]")) if isinstance(r.get("key_files"), str) else (r.get("key_files") or []),
                    current_task=r.get("current_task", ""),
                    open_issues=json.loads(r.get("open_issues", "[]")) if isinstance(r.get("open_issues"), str) else (r.get("open_issues") or []),
                    recent_decisions=json.loads(r.get("recent_decisions", "[]")) if isinstance(r.get("recent_decisions"), str) else (r.get("recent_decisions") or []),
                    last_active=r.get("last_active", datetime.now(timezone.utc)),
                ))
            return results

    # ── VectorStore ─────────────────────────────

    async def add(self, memories: list[Memory]) -> list[str]:
        return await self.save_memories_batch(memories)

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        layer: Optional[MemoryLayer] = None,
        memory_type: Optional[MemoryType] = None,
        project: Optional[str] = None,
        min_importance: float = 0.0,
    ) -> list[Memory]:
        """Vector similarity search with optional filters."""
        conditions = ["embedding IS NOT NULL"]
        params: dict = {
            "query_vector": query_vector,
            "limit": top_k,
            "min_importance": min_importance,
        }

        if layer:
            conditions.append("layer = %(layer)s")
            params["layer"] = layer.value
        if memory_type:
            conditions.append("memory_type = %(memory_type)s")
            params["memory_type"] = memory_type.value
        if project:
            conditions.append("project = %(project)s")
            params["project"] = project

        conditions.append("importance >= %(min_importance)s")

        where = " AND ".join(conditions)
        sql_query = f"""
            SELECT *, 1 - (embedding <=> %(query_vector)s::vector) AS similarity
            FROM memories
            WHERE {where}
            ORDER BY embedding <=> %(query_vector)s::vector
            LIMIT %(limit)s;
        """

        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql_query, params)
                rows = cur.fetchall()
                return [self._row_to_memory(dict(r)) for r in rows]
        except Exception as e:
            logger.warning(f"Vector search failed (maybe no IVFFlat index yet): {e}")
            return []

    async def delete(self, memory_ids: list[str]) -> int:
        return await self.delete_memories(memory_ids)

    async def get_by_id(self, memory_id: str) -> Optional[Memory]:
        return await self.get_memory(memory_id)

    # ── Execution History ──────────────────────

    def save_execution(self, goal: str, outcome: str, steps_total: int, steps_passed: int, details: dict = None) -> int:
        """Save an execution record. Returns row id."""
        import json as _json
        details_json = _json.dumps(details or {}, default=str)
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO execution_history (goal, outcome, steps_total, steps_passed, details)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (goal, outcome, steps_total, steps_passed, details_json),
            )
            row = cur.fetchone()
            return row["id"] if row else -1

    def get_executions(self, limit: int = 50) -> list[dict]:
        """Get recent execution history."""
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM execution_history ORDER BY created_at DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
            import json as _json
            results = []
            for r in rows:
                d = dict(r)
                if d.get("created_at"):
                    d["timestamp"] = d["created_at"].isoformat()
                # Parse details JSON
                if isinstance(d.get("details"), str):
                    try:
                        d["details"] = _json.loads(d["details"])
                    except Exception:
                        pass
                results.append(d)
            return results


async def create_store(config: dict) -> PgVectorStore:
    """Factory: create PgVectorStore from config."""
    pg = config.get("storage", {}).get("postgres", {})
    store = PgVectorStore(
        host=pg.get("host", "localhost"),
        port=pg.get("port", 5440),
        database=pg.get("database", "deepspace"),
        user=pg.get("user", "deepspace"),
        password=pg.get("password", "deepspace"),
    )
    await store.init_schema()
    return store