"""
Tests for Agent Orchestrator.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core.orchestrator import AgentRole, ExecutionMode
from core.models import ActionStep, ActionResult, StepStatus


class TestAgentRole:
    """Test agent role enumeration."""

    def test_all_roles(self):
        expected = {
            "executive", "research", "memory", "graph",
            "planning", "action", "verification",
            "reflection", "proactive",
        }
        actual = {r.value for r in AgentRole}
        assert actual == expected

    def test_seven_agents(self):
        assert len(AgentRole) == 9


class TestOrchestratorInit:
    """Test orchestrator initialization."""

    def test_constructor(self):
        with patch('core.orchestrator.AutonomousLearner'), \
             patch('core.orchestrator.ProactiveService'):
            from core.orchestrator import Orchestrator
            mock_engine = MagicMock()
            mock_llm = MagicMock()
            mock_config = {}

            orch = Orchestrator(mock_engine, mock_llm, mock_config, plugin_handlers={})
            assert orch.engine == mock_engine
            assert orch.llm == mock_llm
            assert orch.config == mock_config
            assert orch.learner is not None
            assert orch.proactive is not None
            assert orch._running is False


def _make_orchestrator(mock_engine=None, mock_llm=None):
    """Helper to create a test orchestrator with proper async mocks."""
    with patch('core.orchestrator.AutonomousLearner'), \
         patch('core.orchestrator.ProactiveService'):
        from core.orchestrator import Orchestrator
        engine = mock_engine or MagicMock()
        llm = mock_llm or MagicMock()

        # Ensure critical async methods are properly mocked
        if not isinstance(getattr(engine, 'stats', None), AsyncMock):
            engine.stats = AsyncMock(return_value={"total_memories": 0})
        if not isinstance(getattr(engine, 'reflect', None), AsyncMock):
            engine.reflect = AsyncMock(return_value={"gaps": [], "recommendations": []})
        if not isinstance(getattr(engine, 'remember', None), AsyncMock):
            engine.remember = AsyncMock()
        if not isinstance(getattr(engine, 'graph_store', None), MagicMock):
            engine.graph_store = MagicMock()
            engine.graph_store.search_entities = AsyncMock(return_value=[])
            engine.graph_store.merge_entity = AsyncMock()
        if not isinstance(getattr(engine, 'vector_store', None), MagicMock):
            engine.vector_store = MagicMock()
            engine.vector_store.record_execution = AsyncMock()

        orch = Orchestrator(engine, llm, {})
        # Replace proactive with properly async mock
        orch.proactive = MagicMock()
        orch.proactive.detect_context = AsyncMock(return_value={"active_project": None})
        orch.proactive.predict_needs = AsyncMock(return_value=[])
        orch.proactive.push = AsyncMock(return_value=None)

        return orch


class TestOrchestratorDispatch:
    """Test agent dispatch by role."""

    def test_dispatch_returns_valid_fields(self):
        engine = MagicMock()
        engine.stats = AsyncMock(return_value={"total_memories": 0})
        orch = _make_orchestrator(engine)

        result = asyncio.run(orch.dispatch(AgentRole.MEMORY, action="stats"))
        assert "role" in result
        assert result["role"] == "memory"

    def test_dispatch_unknown_role_returns_error(self):
        orch = _make_orchestrator()

        result = asyncio.run(orch.dispatch(AgentRole.EXECUTIVE, goal="test"))
        assert "error" in result


class TestDeriveGoals:
    """Test goal derivation from reflection gaps."""

    def test_derive_goals_empty(self):
        engine = MagicMock()
        engine.reflect = AsyncMock(return_value={"gaps": [], "recommendations": []})
        orch = _make_orchestrator(engine)

        goals = asyncio.run(orch.derive_goals(max_goals=5))
        assert goals == []

    def test_derive_goals_from_gaps(self):
        engine = MagicMock()
        engine.reflect = AsyncMock(return_value={
            "gaps": [{"topic": "rust async", "priority": 0.8, "reason": "gap in knowledge"}],
            "recommendations": [],
        })
        orch = _make_orchestrator(engine)

        goals = asyncio.run(orch.derive_goals(max_goals=5))
        assert len(goals) == 1
        assert goals[0]["description"] == "Research and understand: rust async"


class TestSolveGoal:
    """Test the solve_goal pipeline."""

    def test_solve_goal_returns_structure(self):
        engine = MagicMock()
        engine.remember = AsyncMock()
        engine.vector_store = MagicMock()
        engine.vector_store.record_execution = AsyncMock()
        engine.graph_store = MagicMock()
        engine.graph_store.merge_entity = AsyncMock()

        llm = MagicMock()
        llm.chat_structured = AsyncMock(return_value={
            "steps": [{"instruction": "Analyze requirements", "command": "echo done", "depends_on": []}],
            "explanation": "Simple plan",
        })
        llm.chat = AsyncMock(return_value="Verification passed: all checks OK")

        orch = _make_orchestrator(engine, llm)
        orch._agent_action = AsyncMock(return_value={
            "step": 1, "status": "completed", "result": {"stdout": "ok", "exit_code": 0}
        })

        result = asyncio.run(orch.solve_goal(
            description="Test goal",
            context="",
            mode=ExecutionMode.SEMI_AUTO,
        ))
        assert "goal" in result
        assert "outcome" in result
        assert result["outcome"] == "success"

    def test_solve_goal_plan_only_mode(self):
        llm = MagicMock()
        llm.chat_structured = AsyncMock(return_value={
            "steps": [{"instruction": "Step 1", "command": "ls", "depends_on": []}],
            "explanation": "Plan only",
        })
        orch = _make_orchestrator(mock_llm=llm)

        result = asyncio.run(orch.solve_goal(
            description="Plan test",
            context="",
            mode=ExecutionMode.PLAN_ONLY,
        ))
        assert result["outcome"] == "planned_only"
        assert len(result["plan"]["steps"]) == 1


class TestAgentAction:
    def test_agent_action_with_step_dict(self):
        orch = _make_orchestrator()
        # Mock executor to return success
        orch.executor.execute_with_retry = AsyncMock(return_value=ActionResult(
            step_id="s1", step_number=1, status=StepStatus.COMPLETED,
            stdout="done", exit_code=0,
        ))
        orch.llm.summarize = AsyncMock(return_value="summary text")

        result = asyncio.run(orch.agent_action(step_dict={
            "step_number": 1, "description": "test step",
            "command": "echo hello",
        }))
        assert result["role"] == "action"
        assert "result" in result

    def test_agent_action_no_step_returns_error(self):
        orch = _make_orchestrator()
        result = asyncio.run(orch.agent_action())
        assert result["role"] == "action"
        assert "error" in result

    def test_agent_action_failure_with_error_analysis(self):
        orch = _make_orchestrator()
        orch.executor.execute_with_retry = AsyncMock(return_value=ActionResult(
            step_id="s1", step_number=1, status=StepStatus.FAILED,
            stderr="command not found", exit_code=127,
        ))
        orch.llm.chat = AsyncMock(return_value="The command was not found in PATH.")

        result = asyncio.run(orch.agent_action(step_dict={
            "step_number": 1, "description": "bad cmd",
            "command": "nonexistent_cmd",
        }))
        assert result["role"] == "action"
        assert result["result"]["status"] == "failed"


class TestAgentVerification:
    def test_verification_failed_step_quick_path(self):
        orch = _make_orchestrator()
        result = asyncio.run(orch._agent_verification(
            step_dict={"step_number": 1, "description": "test", "command": "fail"},
            result_dict={"step_id": "s1", "step_number": 1,
                         "status": "failed", "stderr": "error output", "exit_code": 1},
        ))
        assert result["role"] == "verification"
        assert result["verification"]["passed"] is False

    def test_verification_missing_args(self):
        orch = _make_orchestrator()
        result = asyncio.run(orch._agent_verification())
        assert "error" in result


class TestAgentReflection:
    def test_reflection_returns_role(self):
        orch = _make_orchestrator()
        result = asyncio.run(orch._agent_reflection())
        assert result["role"] == "reflection"
        assert "data" in result


class TestAgentProactive:
    def test_proactive_returns_role(self):
        orch = _make_orchestrator()
        result = asyncio.run(orch._agent_proactive())
        assert result["role"] == "proactive"
        assert "context" in result


class TestRecoveryFlow:
    def test_recovery_research_generates_fix(self):
        orch = _make_orchestrator()
        orch.llm.chat_structured = AsyncMock(return_value={
            "fix_command": "pip install missing-pkg",
            "explanation": "Package not installed",
            "confidence": 0.9,
        })
        step = ActionStep(step_number=1, description="test", command="python -c 'import foo'")
        exec_data = {"stdout": "", "stderr": "ModuleNotFoundError: No module named 'foo'", "exit_code": 1}

        fix = asyncio.run(orch._recovery_research(step, exec_data))
        assert fix == "pip install missing-pkg"

    def test_recovery_research_low_confidence_returns_none(self):
        orch = _make_orchestrator()
        orch.llm.chat_structured = AsyncMock(return_value={
            "fix_command": "reboot server",
            "explanation": "Maybe it helps",
            "confidence": 0.2,
        })
        step = ActionStep(step_number=1, description="test", command="bad")

        fix = asyncio.run(orch._recovery_research(step, {"exit_code": -1}))
        assert fix is None

    def test_recovery_research_empty_command_returns_none(self):
        orch = _make_orchestrator()
        orch.llm.chat_structured = AsyncMock(return_value={
            "fix_command": "   ",
            "explanation": "No fix possible",
            "confidence": 0.8,
        })
        step = ActionStep(step_number=1, description="test", command="bad")

        fix = asyncio.run(orch._recovery_research(step, {"exit_code": -1}))
        assert fix is None

    def test_recovery_apply_success(self):
        orch = _make_orchestrator()
        orch.executor.execute_with_retry = AsyncMock(return_value=ActionResult(
            step_id="fix1", step_number=-1, status=StepStatus.COMPLETED,
            stdout="Package installed", exit_code=0,
        ))
        step = ActionStep(step_number=1, description="test", command="fail")

        ok = asyncio.run(orch._recovery_apply(step, "pip install pkg"))
        assert ok is True

    def test_recovery_apply_returns_false_on_failure(self):
        orch = _make_orchestrator()
        orch.executor.execute_with_retry = AsyncMock(return_value=ActionResult(
            step_id="fix1", step_number=-1, status=StepStatus.FAILED,
            stderr="Install failed", exit_code=1,
        ))
        step = ActionStep(step_number=1, description="test", command="fail")

        ok = asyncio.run(orch._recovery_apply(step, "bad fix"))
        assert ok is False