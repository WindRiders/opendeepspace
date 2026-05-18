"""
Agent Orchestrator — multi-agent coordination for DeepSpace.
Manages specialized agents: Research, Memory, Graph, Planning, Reflection.
"""

from __future__ import annotations

import asyncio
import logging
from enum import Enum
from typing import Optional

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.proactive_service import ProactiveService
from core.autonomous_learner import AutonomousLearner
from core.models import Memory, MemoryLayer, MemoryType, now_utc

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    EXECUTIVE = "executive"       # Coordinates all agents
    RESEARCH = "research"         # Searches and learns
    MEMORY = "memory"             # Manages memories
    GRAPH = "graph"               # Maintains knowledge graph
    PLANNING = "planning"         # Task decomposition and planning
    REFLECTION = "reflection"     # Meta-cognition
    PROACTIVE = "proactive"       # Context monitoring and push


class Orchestrator:
    """
    Multi-agent orchestrator.
    
    In production, each agent would be a separate async task or subprocess.
    For now, they run as coordinated method calls within the same process.
    """

    def __init__(
        self,
        engine: MemoryEngine,
        llm: LLMClient,
        config: dict,
    ):
        self.engine = engine
        self.llm = llm
        self.config = config
        self.learner = AutonomousLearner(engine, llm, config)
        self.proactive = ProactiveService(engine, llm, config)
        self._running = False
        self._tasks: dict[str, asyncio.Task] = {}

    # ── Agent Dispatch ─────────────────────────

    async def dispatch(self, role: AgentRole, **kwargs) -> dict:
        """Dispatch a task to a specific agent."""
        dispatcher = {
            AgentRole.RESEARCH: self._agent_research,
            AgentRole.MEMORY: self._agent_memory,
            AgentRole.GRAPH: self._agent_graph,
            AgentRole.PLANNING: self._agent_planning,
            AgentRole.REFLECTION: self._agent_reflection,
            AgentRole.PROACTIVE: self._agent_proactive,
        }

        handler = dispatcher.get(role)
        if not handler:
            return {"error": f"Unknown agent role: {role}"}

        return await handler(**kwargs)

    async def _agent_research(self, query: str = "", **kwargs) -> dict:
        """Research Agent: search and synthesize."""
        task = await self.learner.check_and_learn(force=True)
        if task and task.status.value == "completed":
            return {
                "role": "research",
                "status": "completed",
                "title": task.title,
                "findings": task.findings[:500],
            }
        return {"role": "research", "status": "no_task"}

    async def _agent_memory(
        self, action: str = "stats", memory_id: str = "", **kwargs
    ) -> dict:
        """Memory Agent: manage memories."""
        if action == "stats":
            stats = await self.engine.stats()
            return {"role": "memory", "action": "stats", "data": stats}
        elif action == "get" and memory_id:
            mem = await self.engine.get_memory(memory_id)
            return {"role": "memory", "action": "get", "memory": mem}
        elif action == "consolidate":
            result = await self.engine.consolidate()
            return {"role": "memory", "action": "consolidate", "result": result}
        return {"role": "memory", "action": action, "status": "ok"}

    async def _agent_graph(self, query: str = "", **kwargs) -> dict:
        """Graph Agent: knowledge graph operations."""
        entities = await self.engine.graph_store.search_entities(query, top_k=10)
        return {
            "role": "graph",
            "query": query,
            "entities": [
                {"name": e.name, "type": e.entity_type.value}
                for e in entities
            ],
        }

    async def _agent_planning(self, goal: str = "", **kwargs) -> dict:
        """Planning Agent: decompose goals into tasks."""
        if not goal:
            return {"role": "planning", "error": "No goal provided"}

        # Use LLM to decompose
        context = await self.proactive.detect_context()
        reflection = await self.engine.reflect()

        plan = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a planning agent. Decompose the user's goal into "
                        "actionable tasks. Consider the current context and knowledge gaps. "
                        "Return 3-5 tasks in priority order."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Goal: {goal}\n"
                        f"Current context: {context}\n"
                        f"Knowledge gaps: {reflection.get('gaps', [])[:5]}"
                    ),
                },
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "task": {"type": "string"},
                                "priority": {"type": "number"},
                                "estimated_minutes": {"type": "integer"},
                                "dependencies": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                    "rationale": {"type": "string"},
                },
            },
        )
        return {"role": "planning", "goal": goal, "plan": plan}

    async def _agent_reflection(self, **kwargs) -> dict:
        """Reflection Agent: meta-cognition."""
        result = await self.engine.reflect()
        return {"role": "reflection", "data": result}

    async def _agent_proactive(self, **kwargs) -> dict:
        """Proactive Agent: context monitoring and push."""
        context = await self.proactive.detect_context()
        predictions = await self.proactive.predict_needs()
        return {
            "role": "proactive",
            "context": context,
            "predictions": predictions[:3],
        }

    # ── Full Pipeline ──────────────────────────

    async def run_full_cycle(self) -> dict:
        """Run a complete orchestration cycle."""
        cycle_id = now_utc().isoformat()
        results = {}

        logger.info(f"Starting orchestration cycle {cycle_id}")

        # 1. Memory consolidation
        try:
            results["consolidation"] = await self.engine.consolidate()
            results["consolidation"]["status"] = "ok"
        except Exception as e:
            results["consolidation"] = {"status": "error", "error": str(e)}

        # 2. Reflection
        try:
            results["reflection"] = await self.engine.reflect()
        except Exception as e:
            results["reflection"] = {"status": "error", "error": str(e)}

        # 3. Autonomous learning (non-blocking, one task)
        try:
            learn_result = await self.learner.check_and_learn(force=False)
            results["learning"] = {
                "status": "completed" if learn_result else "skipped",
                "task": learn_result.title if learn_result else None,
            }
        except Exception as e:
            results["learning"] = {"status": "error", "error": str(e)}

        # 4. Proactive check
        try:
            push_message = await self.proactive.push()
            results["proactive"] = {
                "pushed": push_message is not None,
                "message": push_message,
            }
        except Exception as e:
            results["proactive"] = {"status": "error", "error": str(e)}

        results["cycle_id"] = cycle_id
        logger.info(f"Orchestration cycle {cycle_id} complete")

        return results

    # ── Continuous Loop ────────────────────────

    async def run_loop(
        self,
        consolidate_interval: int = 60,
        learn_interval: int = 15,
        proactive_interval: int = 10,
    ):
        """Run the orchestrator continuously with staggered intervals."""
        self._running = True
        last_consolidation = 0.0
        last_learn = 0.0
        last_proactive = 0.0

        logger.info("Orchestrator started (Executive Agent online)")

        while self._running:
            now = asyncio.get_event_loop().time()

            # Consolidation (every hour)
            if now - last_consolidation >= consolidate_interval * 60:
                try:
                    await self.engine.consolidate()
                    last_consolidation = now
                    logger.debug("Consolidation cycle complete")
                except Exception as e:
                    logger.error(f"Consolidation failed: {e}")

            # Learning (every 15 min, if idle)
            if now - last_learn >= learn_interval * 60:
                try:
                    await self.learner.check_and_learn(force=False)
                    last_learn = now
                except Exception as e:
                    logger.error(f"Learning cycle failed: {e}")

            # Proactive (every 10 min)
            if now - last_proactive >= proactive_interval * 60:
                try:
                    await self.proactive.push()
                    last_proactive = now
                except Exception as e:
                    logger.error(f"Proactive cycle failed: {e}")

            await asyncio.sleep(60)  # Check every minute

    def stop(self):
        """Stop the orchestrator and all sub-agents."""
        self._running = False
        self.learner.stop()
        logger.info("Orchestrator stopped")