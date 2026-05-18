"""
Tests for Agent Orchestrator.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core.orchestrator import AgentRole


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