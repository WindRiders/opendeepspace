"""
Autonomous Learner — idle-time research and knowledge acquisition engine.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import psutil

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import (
    LearningTask,
    LearningTaskStatus,
    MemoryLayer,
    MemoryType,
    now_utc,
    new_id,
)

logger = logging.getLogger(__name__)


class AutonomousLearner:
    """
    Runs in the background, detects idle time, and executes learning tasks.
    
    Priority algorithm:
        priority = w1*user_relevance + w2*knowledge_gap + w3*freshness + w4*curiosity
    """

    def __init__(
        self,
        engine: MemoryEngine,
        llm: LLMClient,
        config: dict,
    ):
        self.engine = engine
        self.llm = llm
        self.learner_cfg = config.get("learner", {})
        self.weights = self.learner_cfg.get("priority_weights", {
            "user_relevance": 0.4,
            "knowledge_gap": 0.3,
            "freshness": 0.15,
            "curiosity": 0.15,
        })
        self.pending_tasks: list[LearningTask] = []
        self._running = False

    # ── Idle Detection ─────────────────────────

    def is_idle(self) -> bool:
        """Check if the system is idle enough for learning."""
        cpu_percent = psutil.cpu_percent(interval=1)
        threshold = self.learner_cfg.get("idle_cpu_threshold", 70)
        return cpu_percent < (100 - threshold)

    async def check_and_learn(self, force: bool = False) -> Optional[LearningTask]:
        """Check if idle, and if so, execute the highest-priority learning task."""
        if not force and not self.is_idle():
            logger.debug(f"System busy, skipping learning cycle.")
            return None

        if not self.pending_tasks:
            await self._generate_tasks()

        if not self.pending_tasks:
            return None

        # Pick the highest priority pending task
        self.pending_tasks.sort(key=lambda t: t.priority, reverse=True)
        task = self.pending_tasks[0]

        # Check cost budget
        if self._check_budget(task):
            return await self._execute_task(task)

        return None

    # ── Task Generation ────────────────────────

    async def _generate_tasks(self) -> None:
        """Generate learning tasks from knowledge gaps and reflections."""
        try:
            reflection = await self.engine.reflect()

            gaps = reflection.get("gaps", [])
            recommendations = reflection.get("recommendations", [])

            for gap in gaps:
                priority = self._calculate_priority(
                    user_relevance=gap.get("priority", 0.5),
                    knowledge_gap=0.8,  # These ARE gaps, so high gap score
                    freshness=0.5,
                    curiosity=0.5,
                )
                task = LearningTask(
                    title=f"Research: {gap['topic']}",
                    description=gap.get("reason", ""),
                    priority=priority,
                    source="knowledge_gap",
                    query=await self.llm.generate_research_query(
                        gap["topic"],
                        [gap.get("reason", "")],
                    ),
                )
                self.pending_tasks.append(task)

            for rec in recommendations:
                task = LearningTask(
                    title=f"Explore: {rec[:80]}",
                    description=rec,
                    priority=0.6,
                    source="recommendation",
                    query=rec,
                )
                self.pending_tasks.append(task)

            logger.info(f"Generated {len(self.pending_tasks)} learning tasks.")

        except Exception as e:
            logger.error(f"Task generation failed: {e}")

    def _calculate_priority(
        self,
        user_relevance: float = 0.5,
        knowledge_gap: float = 0.5,
        freshness: float = 0.5,
        curiosity: float = 0.5,
    ) -> float:
        """Calculate composite priority score, clamped to [0, 1]."""
        raw = (
            self.weights.get("user_relevance", 0.4) * min(user_relevance, 1.0) +
            self.weights.get("knowledge_gap", 0.3) * min(knowledge_gap, 1.0) +
            self.weights.get("freshness", 0.15) * min(freshness, 1.0) +
            self.weights.get("curiosity", 0.15) * min(curiosity, 1.0)
        )
        return max(0.0, min(1.0, raw))

    def _check_budget(self, task: LearningTask) -> bool:
        """Check if we have budget for this task."""
        daily_budget = self.learner_cfg.get("daily_cost_budget", 1.0)
        # Simple check: allow if task cost estimate < daily budget
        return task.cost_estimate < daily_budget

    # ── Task Execution ─────────────────────────

    async def _execute_task(self, task: LearningTask) -> LearningTask:
        """Execute a learning task: research → analyze → integrate."""
        logger.info(f"Executing learning task: {task.title}")
        task.status = LearningTaskStatus.RESEARCHING

        try:
            # Phase 1: Research — this would normally use web_search
            # For now, use LLM's internal knowledge to research
            task.status = LearningTaskStatus.ANALYZING
            findings = await self._research(task.query)

            # Phase 2: Verify/Integrate
            task.status = LearningTaskStatus.INTEGRATING
            await self._integrate_findings(task, findings)

            task.status = LearningTaskStatus.COMPLETED
            task.completed_at = now_utc()
            task.findings = findings

            # Remove from pending
            self.pending_tasks = [t for t in self.pending_tasks if t.id != task.id]

            logger.info(f"Task completed: {task.title}")

        except Exception as e:
            logger.error(f"Task failed: {task.title}: {e}")
            task.status = LearningTaskStatus.FAILED

        return task

    async def _research(self, query: str) -> str:
        """Research a topic using LLM's knowledge."""
        findings = await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a research assistant. Provide a thorough, well-structured "
                        "analysis of the query. Include key concepts, best practices, "
                        "common pitfalls, and actionable insights. Cite specific tools, "
                        "libraries, or papers when relevant. Use Chinese if the query is in Chinese."
                    ),
                },
                {"role": "user", "content": query},
            ],
            temperature=0.5,
            max_tokens=4096,
        )
        return findings

    async def _integrate_findings(self, task: LearningTask, findings: str) -> None:
        """Store research findings as long-term memories."""
        # Store the findings as a memory
        await self.engine.remember(
            content=f"Research: {task.title}\n\n{findings}",
            layer=MemoryLayer.LONG_TERM,
            memory_type=MemoryType.READING,
            importance=0.7,
            source="autonomous_learner",
            tags=["research", "auto-learned"],
        )

        # Also store key takeaways individually
        takeaways = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract 3-5 key takeaways as individual concise facts from this research. "
                        "Each takeaway should be a self-contained, actionable piece of knowledge."
                    ),
                },
                {"role": "user", "content": findings[:3000]},
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "takeaways": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        )

        for takeaway in takeaways.get("takeaways", []):
            await self.engine.remember(
                content=takeaway,
                layer=MemoryLayer.LONG_TERM,
                memory_type=MemoryType.CONCEPT,
                importance=0.6,
                source="autonomous_learner",
                tags=["takeaway", "auto-learned"],
            )

    # ── Scheduler Loop ─────────────────────────

    async def run_loop(self, interval_minutes: int = 15) -> None:
        """Run the learning loop continuously."""
        self._running = True
        logger.info(f"Autonomous learner started (check every {interval_minutes} min).")

        while self._running:
            try:
                await self.check_and_learn()
            except Exception as e:
                logger.error(f"Learning loop error: {e}")

            await asyncio.sleep(interval_minutes * 60)

    def stop(self):
        """Stop the learning loop."""
        self._running = False

    # ── Status ─────────────────────────────────

    async def status(self) -> dict:
        """Get learner status."""
        return {
            "running": self._running,
            "pending_tasks": len(self.pending_tasks),
            "top_tasks": [
                {"title": t.title, "priority": t.priority, "status": t.status.value}
                for t in sorted(self.pending_tasks, key=lambda x: x.priority, reverse=True)[:5]
            ],
        }