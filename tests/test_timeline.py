"""
Tests for TimelineGenerator — memory timeline, execution timeline, milestones.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.timeline import TimelineGenerator
from core.models import Memory, MemoryLayer, MemoryType, now_utc


def _make_memory(
    id: str = "m1",
    content: str = "test memory",
    layer: MemoryLayer = MemoryLayer.SHORT_TERM,
    mtype: MemoryType = MemoryType.FACT,
    importance: float = 0.5,
) -> Memory:
    return Memory(
        id=id, content=content, layer=layer,
        memory_type=mtype, importance=importance,
        created_at=now_utc(),
    )


@pytest.fixture
def mock_engine():
    engine = MagicMock()
    engine.vector_store = MagicMock()
    engine.vector_store.get_by_layer = AsyncMock(return_value=[])
    return engine


class TestTimelineGeneratorInit:
    def test_init_stores_engine(self, mock_engine):
        tg = TimelineGenerator(mock_engine)
        assert tg.engine is mock_engine
        assert tg.orch is None

    def test_init_with_orchestrator(self, mock_engine):
        orch = MagicMock()
        tg = TimelineGenerator(mock_engine, orchestrator=orch)
        assert tg.orch is orch


class TestMemoryTimeline:
    def test_returns_empty_when_no_memories(self, mock_engine):
        tg = TimelineGenerator(mock_engine)
        result = asyncio.run(tg.get_memory_timeline(days=30))
        assert result == []

    def test_returns_memories_as_dicts(self, mock_engine):
        mem = _make_memory(content="hello world")
        # Only return memory for short_term, empty for others
        async def _get_by_layer(layer, limit=200):
            return [mem] if layer == MemoryLayer.SHORT_TERM else []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        tg = TimelineGenerator(mock_engine)

        result = asyncio.run(tg.get_memory_timeline(days=30))
        assert len(result) == 1
        assert result[0]["id"] == mem.id
        assert result[0]["content"] == "hello world"
        assert result[0]["layer"] == "short_term"
        assert result[0]["type"] == "fact"
        assert "date" in result[0]

    def test_filters_old_memories(self, mock_engine):
        old = _make_memory(id="old")
        old.created_at = now_utc() - timedelta(days=60)
        async def _get_by_layer(layer, limit=200):
            return [old] if layer == MemoryLayer.SHORT_TERM else []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        tg = TimelineGenerator(mock_engine)

        result = asyncio.run(tg.get_memory_timeline(days=30))
        assert result == []

    def test_queries_all_layers(self, mock_engine):
        org_get = mock_engine.vector_store.get_by_layer
        mock_engine.vector_store.get_by_layer = AsyncMock(return_value=[])
        tg = TimelineGenerator(mock_engine)
        asyncio.run(tg.get_memory_timeline(days=30))
        assert mock_engine.vector_store.get_by_layer.call_count == 4

    def test_queries_specific_layer(self, mock_engine):
        mock_engine.vector_store.get_by_layer = AsyncMock(return_value=[])
        tg = TimelineGenerator(mock_engine)
        asyncio.run(tg.get_memory_timeline(days=30, layer=MemoryLayer.LONG_TERM))
        assert mock_engine.vector_store.get_by_layer.call_count == 1
        mock_engine.vector_store.get_by_layer.assert_called_with(
            MemoryLayer.LONG_TERM, limit=200
        )


class TestExecutionTimeline:
    def test_returns_empty_without_orchestrator(self, mock_engine):
        tg = TimelineGenerator(mock_engine)
        result = asyncio.run(tg.get_execution_timeline())
        assert result == []

    def test_returns_sorted_history(self, mock_engine):
        orch = MagicMock()
        orch.execution_history = [
            {"goal": "task2", "timestamp": "2026-06-02T10:00:00Z", "outcome": "success"},
            {"goal": "task1", "timestamp": "2026-06-01T10:00:00Z", "outcome": "success"},
        ]
        tg = TimelineGenerator(mock_engine, orchestrator=orch)

        result = asyncio.run(tg.get_execution_timeline())
        assert len(result) == 2
        assert result[0]["goal"] == "task1"


class TestFullTimeline:
    def test_returns_structure(self, mock_engine):
        mem = _make_memory()
        async def _get_by_layer(layer, limit=200):
            return [mem] if layer == MemoryLayer.SHORT_TERM else []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        tg = TimelineGenerator(mock_engine)

        result = asyncio.run(tg.get_full_timeline(days=30))
        assert "days" in result
        assert "total_events" in result
        assert "timeline" in result
        assert result["total_events"] == 1

    def test_includes_executions(self, mock_engine):
        mem = _make_memory()
        async def _get_by_layer(layer, limit=200):
            return [mem] if layer == MemoryLayer.SHORT_TERM else []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        orch = MagicMock()
        orch.execution_history = [
            {"goal": "task", "timestamp": now_utc().isoformat(), "outcome": "success",
             "steps_passed": 3, "steps_total": 5},
        ]
        tg = TimelineGenerator(mock_engine, orchestrator=orch)

        result = asyncio.run(tg.get_full_timeline(days=30))
        assert result["total_events"] == 2


class TestMilestones:
    def test_detects_high_importance_as_milestone(self):
        tg = TimelineGenerator(MagicMock())
        mems = [
            {"date": "2026-06-01", "content": "critical finding", "importance": 0.95},
            {"date": "2026-06-02", "content": "minor note", "importance": 0.3},
        ]
        milestones = tg._detect_milestones(mems)
        assert len(milestones) == 1
        assert milestones[0]["title"] == "critical finding"
        assert milestones[0]["importance"] == 0.95

    def test_no_milestones_from_low_importance(self):
        tg = TimelineGenerator(MagicMock())
        mems = [{"date": "2026-06-01", "content": "note", "importance": 0.3}]
        assert tg._detect_milestones(mems) == []

    def test_milestones_capped_at_20(self):
        tg = TimelineGenerator(MagicMock())
        mems = [{"date": f"2026-06-{i:02d}", "content": f"event {i}", "importance": 0.9} for i in range(1, 26)]
        assert len(tg._detect_milestones(mems)) == 20


class TestProjectTimeline:
    def test_returns_structure(self, mock_engine):
        async def _get_by_layer(layer, limit=200):
            return []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        tg = TimelineGenerator(mock_engine)

        result = asyncio.run(tg.get_project_timeline("random-project"))
        assert result["project"] == "random-project"
        assert result["memories"] == 0

    def test_filters_by_project(self, mock_engine):
        mem = _make_memory(content="correct project")
        mem.project = "target-proj"
        async def _get_by_layer(layer, limit=200):
            return [mem] if layer == MemoryLayer.SHORT_TERM else []
        mock_engine.vector_store.get_by_layer = _get_by_layer
        tg = TimelineGenerator(mock_engine)

        result = asyncio.run(tg.get_project_timeline("target-proj"))
        assert result["memories"] == 1
        assert result["first_activity"] is not None