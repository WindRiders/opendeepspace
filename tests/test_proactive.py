"""
Tests for ProactiveService context detection and prediction.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from core.models import Memory, MemoryLayer, MemoryType, now_utc


@pytest.fixture
def mock_config():
    return {
        "proactive": {
            "push_confidence": 0.7,
            "push_cooldown": 30,
            "max_daily_pushes": 5,
        },
        "memory": {},
    }


class TestContextRelevance:
    """Test context relevance calculation (pure function, no mocks needed)."""

    def test_direct_match(self):
        from core.proactive_service import ProactiveService
        score = ProactiveService._calculate_context_relevance(
            "Neo4j", "Working on Neo4j integration", []
        )
        assert score == 1.0

    def test_topic_match(self):
        from core.proactive_service import ProactiveService
        score = ProactiveService._calculate_context_relevance(
            "pgvector",
            "optimizing database queries",
            ["PostgreSQL", "pgvector", "Docker"],
        )
        assert score == 0.8

    def test_keyword_overlap(self):
        from core.proactive_service import ProactiveService
        score = ProactiveService._calculate_context_relevance(
            "database optimization",
            "PostgreSQL database performance tuning",
            [],
        )
        assert score >= 0.5

    def test_no_match(self):
        from core.proactive_service import ProactiveService
        score = ProactiveService._calculate_context_relevance(
            "Kubernetes",
            "Python web development",
            ["FastAPI", "Django"],
        )
        assert score == 0.3


class TestProactiveServiceInit:
    """Test ProactiveService initialization."""

    def test_initial_state(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()

        svc = ProactiveService(mock_engine, mock_llm, mock_config)
        assert svc._last_push_time is None
        assert svc._push_count_today == 0


class TestPushCooldown:
    """Test push cooldown logic."""

    def test_first_push_allowed(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()

        svc = ProactiveService(mock_engine, mock_llm, mock_config)

        # No last push -> should allow
        assert svc._last_push_time is None

    def test_cooldown_blocked(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()

        svc = ProactiveService(mock_engine, mock_llm, mock_config)
        # Set last push to just now
        svc._last_push_time = now_utc()

        import asyncio
        should, predictions = asyncio.run(svc.should_push())
        assert should is False
        assert predictions is None

    def test_daily_limit_reached(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()

        svc = ProactiveService(mock_engine, mock_llm, mock_config)
        svc._push_count_today = 5  # Max daily

        import asyncio
        should, predictions = asyncio.run(svc.should_push())
        assert should is False


class TestPushMessageGeneration:
    """Test push message generation."""

    def test_generate_push_message(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()
        mock_llm.chat = AsyncMock(return_value="建议你学习 Neo4j 查询优化")

        svc = ProactiveService(mock_engine, mock_llm, mock_config)

        import asyncio
        predictions = [{
            "type": "knowledge_gap_alert",
            "topic": "Neo4j optimization",
            "action": "Research Neo4j query optimization",
            "reason": "You're working with Neo4j",
        }]
        message = asyncio.run(svc.generate_push_message(predictions))
        assert message == "建议你学习 Neo4j 查询优化"

    def test_empty_predictions(self, mock_config):
        from core.proactive_service import ProactiveService
        mock_engine = MagicMock()
        mock_llm = MagicMock()

        svc = ProactiveService(mock_engine, mock_llm, mock_config)
        import asyncio
        message = asyncio.run(svc.generate_push_message([]))
        assert message == ""