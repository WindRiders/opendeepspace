"""
Memory engine tests (mocked stores).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from core.models import (
    Memory, MemoryLayer, MemoryType, MemoryConsolidationResult,
    Entity, EntityType, Relation, RelationType, now_utc,
)


@pytest.fixture
def mock_config():
    return {
        "memory": {
            "consolidation_threshold_days": 1,
            "importance_threshold": 0.6,
        },
    }


@pytest.fixture
def mock_llm():
    llm = MagicMock()
    llm.classify_memory_type = AsyncMock(return_value="fact")
    llm.assess_importance = AsyncMock(return_value=0.7)
    llm.summarize = AsyncMock(return_value="summary")
    llm.embed_single = AsyncMock(return_value=[0.1, 0.2, 0.3])
    llm.extract_entities = AsyncMock(return_value={"entities": [], "relations": []})
    return llm


@pytest.fixture
def mock_vector_store():
    store = MagicMock()
    store.save_memory = AsyncMock()
    store.search = AsyncMock(return_value=[])
    store.search_memories = AsyncMock(return_value=[])
    store.touch = AsyncMock()
    store.get_by_layer = AsyncMock(return_value=[])
    store.delete_memories = AsyncMock(return_value=0)
    store.update_layer = AsyncMock(return_value=0)
    store.get_stale_memories = AsyncMock(return_value=[])
    store.list_projects = AsyncMock(return_value=[])
    store.get_memory = AsyncMock(return_value=None)
    store.save_project_context = AsyncMock()
    return store


@pytest.fixture
def mock_graph_store():
    store = MagicMock()
    store.create_entity = AsyncMock()
    store.create_relation = AsyncMock()
    store.search_entities = AsyncMock(return_value=[])
    store.infer_transitive_relations = AsyncMock(return_value=[])
    return store


@pytest.fixture
def engine(mock_llm, mock_vector_store, mock_graph_store, mock_config):
    from core.memory_engine import MemoryEngine
    return MemoryEngine(mock_llm, mock_vector_store, mock_graph_store, mock_config)


class TestRemember:
    """Test the remember() flow."""

    def test_remember_basic(self, engine, mock_llm, mock_vector_store):
        import asyncio
        mem = asyncio.run(engine.remember(
            content="PostgreSQL uses port 5440",
            project="deepspace",
            tags=["database"],
        ))
        assert isinstance(mem, Memory)
        assert mem.content == "PostgreSQL uses port 5440"
        assert mem.project == "deepspace"
        assert "database" in mem.tags
        mock_vector_store.save_memory.assert_called_once()

    def test_remember_high_importance_promotes(self, engine):
        import asyncio
        engine.llm.assess_importance = AsyncMock(return_value=0.85)
        mem = asyncio.run(engine.remember(
            content="Critical security vulnerability found",
        ))
        assert mem.layer == MemoryLayer.WORKING

    def test_remember_without_auto_embed(self, engine, mock_llm):
        import asyncio
        mem = asyncio.run(engine.remember(
            content="test",
            auto_embed=False,
            auto_summarize=False,
            auto_graph=False,
        ))
        assert mem.embedding is None
        mock_llm.embed_single.assert_not_called()


class TestRecall:
    """Test the recall() flow."""

    def test_recall_empty(self, engine):
        import asyncio
        results = asyncio.run(engine.recall("nothing"))
        assert results == []

    def test_recall_with_vector_results(self, engine, mock_vector_store):
        mock_memory = Memory(content="PostgreSQL config", importance=0.9)
        mock_vector_store.search = AsyncMock(return_value=[mock_memory])

        import asyncio
        results = asyncio.run(engine.recall("PostgreSQL"))
        assert len(results) == 1
        assert results[0].content == "PostgreSQL config"

    def test_recall_dedup(self, engine, mock_vector_store):
        mock_mem = Memory(content="same", importance=0.8)
        mock_vector_store.search = AsyncMock(return_value=[mock_mem])
        mock_vector_store.search_memories = AsyncMock(return_value=[mock_mem])

        import asyncio
        results = asyncio.run(engine.recall("test"))
        assert len(results) == 1  # Deduplicated


class TestForget:
    """Test the forget() flow."""

    def test_forget(self, engine, mock_vector_store):
        mock_vector_store.delete_memories = AsyncMock(return_value=1)
        import asyncio
        count = asyncio.run(engine.forget(["id1"]))
        assert count == 1


class TestConsolidation:
    """Test consolidation logic."""

    def test_consolidation_empty(self, engine):
        import asyncio
        result = asyncio.run(engine.consolidate())
        assert isinstance(result, MemoryConsolidationResult)
        assert result.short_term_processed == 0

    def test_consolidation_promotes_short_term(self, engine, mock_vector_store):
        mems = [
            Memory(content=f"important {i}", layer=MemoryLayer.SHORT_TERM, importance=0.8)
            for i in range(5)
        ]
        mock_vector_store.get_by_layer = AsyncMock(return_value=mems)

        import asyncio
        result = asyncio.run(engine.consolidate())
        assert result.short_term_processed == 5
        assert result.promoted_to_working == 5

    def test_consolidation_forgets_stale(self, engine, mock_vector_store):
        mock_vector_store.get_by_layer = AsyncMock(return_value=[])
        stale = [
            Memory(content="old note", layer=MemoryLayer.SHORT_TERM, importance=0.1, access_count=0)
        ]
        mock_vector_store.get_stale_memories = AsyncMock(return_value=stale)

        import asyncio
        result = asyncio.run(engine.consolidate())
        assert result.forgotten == 1


class TestStats:
    """Test memory statistics."""

    def test_stats(self, engine, mock_vector_store):
        mems_short = [Memory(content="s", layer=MemoryLayer.SHORT_TERM) for _ in range(3)]
        mems_work = [Memory(content="w", layer=MemoryLayer.WORKING) for _ in range(2)]

        def get_by_layer(layer, limit=10000):
            if layer == MemoryLayer.SHORT_TERM:
                return mems_short
            elif layer == MemoryLayer.WORKING:
                return mems_work
            return []
        mock_vector_store.get_by_layer = AsyncMock(side_effect=get_by_layer)

        import asyncio
        stats = asyncio.run(engine.stats())
        assert stats["total_memories"] == 5
        assert stats["by_layer"]["short_term"] == 3
        assert stats["by_layer"]["working"] == 2


class TestProjectContext:
    """Test project context management."""

    def test_set_project_context(self, engine, mock_vector_store):
        import asyncio
        asyncio.run(engine.set_project_context(
            name="deepspace", path="/home/user/deepspace",
            description="memory engine", tech_stack=["Python", "PostgreSQL"],
        ))
        mock_vector_store.save_project_context.assert_called_once()

    def test_get_active_projects(self, engine, mock_vector_store):
        mock_vector_store.list_projects = AsyncMock(return_value=[
            MagicMock(name="deepspace"), MagicMock(name="timemap"),
        ])
        import asyncio
        projects = asyncio.run(engine.get_active_projects())
        assert len(projects) == 2