"""
Integration tests — require Docker containers running.

Run: docker compose up -d && pytest tests/integration/ -v

Skip these in CI without Docker: they auto-detect Docker availability.
"""
import pytest
import subprocess
import sys
import os

# Check if Docker and databases are running
def _docker_running():
    try:
        r = subprocess.run(["docker", "ps"], capture_output=True, text=True, timeout=5)
        return r.returncode == 0 and "deepspace-pg" in r.stdout and "deepspace-neo4j" in r.stdout
    except Exception:
        return False

# ── Skip all if no Docker ──
pytestmark = pytest.mark.skipif(
    not _docker_running(),
    reason="Docker containers (deepspace-pg, deepspace-neo4j) not running. Start with: docker compose up -d"
)


@pytest.fixture
def config():
    """Load real config."""
    import yaml
    import re
    from pathlib import Path

    conf_path = Path(__file__).resolve().parent.parent / "config" / "config.yaml"
    if not conf_path.exists():
        conf_path = Path.home() / "deepspace" / "config" / "config.yaml"

    raw = conf_path.read_text()
    raw = re.sub(r'\$\{(\w+)\}', lambda m: os.environ.get(m.group(1), ""), raw)
    cfg = yaml.safe_load(raw)

    # Load from Hermes if needed
    if not cfg.get("llm", {}).get("api_key") or cfg["llm"]["api_key"].startswith("$"):
        hc = Path.home() / ".hermes" / "config.yaml"
        if hc.exists():
            with open(hc) as f:
                hcfg = yaml.safe_load(f)
            providers = hcfg.get("custom_providers", [])
            if isinstance(providers, dict):
                providers = list(providers.values())
            for p in providers:
                if isinstance(p, dict) and "dashscope" in p.get("base_url", ""):
                    cfg["llm"]["api_key"] = p.get("api_key", "")
                    break

    return cfg


@pytest.fixture
async def engine(config):
    """Create real engine with real databases."""
    from core.llm_client import LLMClient
    from core.memory_engine import MemoryEngine
    from storage.pgvector_store import PgVectorStore, create_store
    from storage.neo4j_store import Neo4jGraphStore, create_graph_store

    llm = LLMClient(config)
    store = await create_store(config)
    graph = await create_graph_store(config)
    engine = MemoryEngine(llm, store, graph, config)
    return engine


class TestRealDatabaseConnection:
    """Test that we can connect to real databases."""

    async def test_pg_connection(self, config):
        from storage.pgvector_store import PgVectorStore
        store = PgVectorStore(
            host=config["storage"]["postgres"]["host"],
            port=config["storage"]["postgres"]["port"],
            database=config["storage"]["postgres"]["database"],
            user=config["storage"]["postgres"]["user"],
            password=config["storage"]["postgres"]["password"],
        )
        # Just test connection doesn't throw
        try:
            cur = store.conn.cursor()
            cur.execute("SELECT 1")
            assert cur.fetchone()[0] == 1
        except Exception as e:
            pytest.fail(f"PostgreSQL connection failed: {e}")

    async def test_neo4j_connection(self, config):
        from storage.neo4j_store import Neo4jGraphStore
        store = Neo4jGraphStore(
            uri=config["storage"]["neo4j"]["uri"],
            user=config["storage"]["neo4j"]["user"],
            password=config["storage"]["neo4j"]["password"],
        )
        try:
            async with store.driver.session() as session:
                result = await session.run("RETURN 1 AS n")
                record = await result.single()
                assert record["n"] == 1
        except Exception as e:
            pytest.fail(f"Neo4j connection failed: {e}")


class TestRealMemoryOps:
    """Test memory operations against real databases."""

    async def test_remember_and_recall(self, engine):
        """Store a memory and retrieve it."""
        import asyncio
        from core.models import MemoryLayer

        # Remember
        mem = await engine.remember(
            content="Integration test: PostgreSQL runs on port 5440",
            project="test",
            tags=["integration-test"],
            auto_summarize=False,
            auto_embed=False,
            auto_graph=False,
        )
        assert mem.id is not None
        assert "Integration test" in mem.content

        # Recall by ID
        found = await engine.get_memory(mem.id)
        assert found is not None
        assert found.content == mem.content

        # Clean up
        await engine.forget([mem.id])

    async def test_stats(self, engine):
        """Get memory statistics."""
        import asyncio
        stats = await engine.stats()
        assert "total_memories" in stats
        assert "by_layer" in stats
        assert isinstance(stats["total_memories"], int)

    async def test_bulk_memories(self, engine):
        """Store and delete multiple memories."""
        import asyncio

        ids = []
        for i in range(5):
            mem = await engine.remember(
                content=f"Bulk test memory {i}",
                project="integration-test",
                auto_summarize=False, auto_embed=False, auto_graph=False,
            )
            ids.append(mem.id)

        # Verify all stored
        stats = await engine.stats()
        assert stats["total_memories"] >= 5

        # Clean up
        count = await engine.forget(ids)
        assert count == 5


class TestRealSchema:
    """Test schema initialization."""

    async def test_init_schema_idempotent(self, config):
        """Schema init should be safe to run multiple times."""
        from storage.pgvector_store import PgVectorStore
        store = PgVectorStore(
            host=config["storage"]["postgres"]["host"],
            port=config["storage"]["postgres"]["port"],
            database=config["storage"]["postgres"]["database"],
            user=config["storage"]["postgres"]["user"],
            password=config["storage"]["postgres"]["password"],
        )
        # Run twice — should not throw
        await store.init_schema()
        await store.init_schema()

    async def test_neo4j_constraints_idempotent(self, config):
        """Neo4j constraints should be safe to run multiple times."""
        from storage.neo4j_store import Neo4jGraphStore
        store = Neo4jGraphStore(
            uri=config["storage"]["neo4j"]["uri"],
            user=config["storage"]["neo4j"]["user"],
            password=config["storage"]["neo4j"]["password"],
        )
        await store._ensure_constraints()
        await store._ensure_constraints()


class TestRealErrorHandling:
    """Test error handling with real DBs."""

    async def test_get_nonexistent_memory(self, engine):
        """Getting a non-existent memory returns None."""
        import asyncio
        result = await engine.get_memory("nonexistent_id_12345")
        assert result is None

    async def test_delete_empty_list(self, engine):
        """Deleting empty list returns 0."""
        import asyncio
        count = await engine.forget([])
        assert count == 0