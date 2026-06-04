"""
Tests for AutonomousLearner — idle-time research and knowledge acquisition.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from core.autonomous_learner import AutonomousLearner
from core.models import LearningTask, LearningTaskStatus


@pytest.fixture
def mock_engine():
    engine = MagicMock()
    engine.remember = AsyncMock()
    engine.reflect = AsyncMock(return_value={"gaps": [], "recommendations": []})
    engine.stats = AsyncMock(return_value={"total_memories": 0})
    return engine


@pytest.fixture
def mock_llm():
    llm = MagicMock()
    llm.chat = AsyncMock(return_value="Research findings about the topic.")
    llm.chat_stream = MagicMock()
    llm.chat_structured = AsyncMock(return_value={"takeaways": ["fact 1", "fact 2"]})
    llm.generate_research_query = AsyncMock(return_value="detailed research query")
    return llm


@pytest.fixture
def learner_config():
    return {
        "learner": {
            "idle_cpu_threshold": 70,
            "check_interval": 15,
            "max_concurrent_tasks": 2,
            "daily_cost_budget": 1.0,
            "priority_weights": {
                "user_relevance": 0.4,
                "knowledge_gap": 0.3,
                "freshness": 0.15,
                "curiosity": 0.15,
            },
        }
    }


@pytest.fixture
def learner(mock_engine, mock_llm, learner_config):
    return AutonomousLearner(mock_engine, mock_llm, learner_config)


class TestAutonomousLearnerInit:
    def test_init_sets_defaults(self, learner):
        assert learner._running is False
        assert learner._daily_cost == 0.0
        assert learner.pending_tasks == []

    def test_init_weights(self, learner):
        assert learner.weights["user_relevance"] == 0.4
        assert learner.weights["knowledge_gap"] == 0.3


class TestPriorityCalculation:
    def test_calculate_priority_max(self, learner):
        p = learner._calculate_priority(1.0, 1.0, 1.0, 1.0)
        assert p == 1.0

    def test_calculate_priority_min(self, learner):
        p = learner._calculate_priority(0.0, 0.0, 0.0, 0.0)
        assert p == 0.0

    def test_calculate_priority_clamped(self, learner):
        p = learner._calculate_priority(2.0, 2.0, 2.0, 2.0)
        assert 0.0 <= p <= 1.0


class TestBudgetCheck:
    def test_budget_allows_zero_cost(self, learner):
        task = LearningTask(title="test", description="", priority=0.5, source="test", query="q")
        assert learner._check_budget(task) is True

    def test_budget_accumulates_daily_cost(self, learner):
        learner._daily_cost = 0.995
        task = LearningTask(title="test", description="", priority=0.5, source="test", query="q")
        # _check_budget uses min estimated cost of 0.01; 0.995 + 0.01 >= 1.0
        assert learner._check_budget(task) is False

    def test_budget_allows_low_cost(self, learner):
        learner._daily_cost = 0.5
        task = LearningTask(title="test", description="", priority=0.5, source="test", query="q")
        assert learner._check_budget(task) is True

    def test_daily_cost_resets_on_new_day(self, learner):
        from datetime import datetime, timezone, timedelta
        learner._daily_cost = 0.5
        learner._last_reset_date = (datetime.now(timezone.utc) - timedelta(days=1)).date()
        learner._reset_daily_cost_if_needed()
        assert learner._daily_cost == 0.0


class TestTaskGeneration:
    def test_generate_tasks_from_gaps(self, learner, mock_engine):
        mock_engine.reflect.return_value = {
            "gaps": [{"topic": "microservices", "priority": 0.8, "reason": "knowledge gap in microservices"}],
            "recommendations": [],
        }
        asyncio.run(learner._generate_tasks())
        assert len(learner.pending_tasks) == 1
        assert "microservices" in learner.pending_tasks[0].title

    def test_generate_tasks_from_recommendations(self, learner, mock_engine):
        mock_engine.reflect.return_value = {
            "gaps": [],
            "recommendations": ["Explore async patterns in Python"],
        }
        asyncio.run(learner._generate_tasks())
        assert len(learner.pending_tasks) == 1
        assert learner.pending_tasks[0].source == "recommendation"

    def test_generate_tasks_empty(self, learner, mock_engine):
        mock_engine.reflect.return_value = {"gaps": [], "recommendations": []}
        asyncio.run(learner._generate_tasks())
        assert len(learner.pending_tasks) == 0


class TestTaskExecution:
    def test_execute_task_research_and_integrate(self, learner, mock_engine, mock_llm):
        task = LearningTask(title="Research: async python", description="", priority=0.8, source="knowledge_gap", query="async python patterns")
        result = asyncio.run(learner._execute_task(task))
        assert result.status == LearningTaskStatus.COMPLETED
        assert mock_engine.remember.call_count >= 1
        assert learner._daily_cost > 0

    def test_execute_task_stores_takeaways(self, learner, mock_engine, mock_llm):
        task = LearningTask(title="Research: patterns", description="", priority=0.7, source="test", query="patterns")
        asyncio.run(learner._execute_task(task))
        # Should store main findings + at least 1 takeaway
        assert mock_engine.remember.call_count >= 2

    def test_execute_task_failure_marks_failed(self, learner, mock_llm):
        mock_llm.chat = AsyncMock(side_effect=Exception("LLM error"))
        task = LearningTask(title="Fail task", description="", priority=0.5, source="test", query="q")
        result = asyncio.run(learner._execute_task(task))
        assert result.status == LearningTaskStatus.FAILED


class TestStatus:
    def test_status_returns_daily_cost(self, learner):
        learner._daily_cost = 0.3
        s = asyncio.run(learner.status())
        assert s["daily_cost"] == 0.3
        assert s["daily_budget"] == 1.0
        assert s["running"] is False

    def test_status_shows_pending_tasks(self, learner):
        learner.pending_tasks = [
            LearningTask(title="t1", description="", priority=0.9, source="test", query="q1"),
            LearningTask(title="t2", description="", priority=0.5, source="test", query="q2"),
        ]
        s = asyncio.run(learner.status())
        assert s["pending_tasks"] == 2
        assert len(s["top_tasks"]) == 2
        assert s["top_tasks"][0]["title"] == "t1"