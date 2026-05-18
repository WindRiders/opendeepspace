"""
Proactive Service Layer — context awareness, prediction, and push notifications.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import Memory, MemoryLayer, MemoryType, now_utc

logger = logging.getLogger(__name__)


class ProactiveService:
    """
    Monitors user context and proactively:
    1. Detects what the user is working on
    2. Predicts what they'll need next
    3. Pushes relevant information at the right time
    """

    def __init__(self, engine: MemoryEngine, llm: LLMClient, config: dict):
        self.engine = engine
        self.llm = llm
        self.proactive_cfg = config.get("proactive", {})
        self._last_push_time: Optional[datetime] = None
        self._push_count_today: int = 0

    # ── Context Detection ──────────────────────

    async def detect_context(self) -> dict:
        """Detect the user's current working context."""
        # Get recent working memories
        recent = await self.engine.vector_store.get_by_layer(
            MemoryLayer.WORKING, limit=20
        )
        # Get active projects
        projects = await self.engine.get_active_projects()

        # Get recent accesses
        active_memories = [m for m in recent if m.access_count > 0]
        active_memories.sort(key=lambda m: m.last_accessed, reverse=True)

        context_summary = await self._summarize_context(
            active_memories[:10], projects
        )

        return {
            "active_project": projects[0].name if projects else None,
            "active_topics": context_summary.get("topics", []),
            "current_focus": context_summary.get("focus", ""),
            "recent_activity": context_summary.get("activity", ""),
            "timestamp": now_utc(),
        }

    async def _summarize_context(
        self, memories: list[Memory], projects: list
    ) -> dict:
        """Use LLM to summarize current context."""
        if not memories:
            return {"topics": [], "focus": "", "activity": "idle"}

        mem_text = "\n".join(
            f"- [{m.memory_type.value}] {m.summary or m.content[:100]}"
            for m in memories[:10]
        )
        proj_text = "\n".join(p.name for p in projects[:5])

        result = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Analyze the user's recent activity and extract:\n"
                        "1. What are they currently working on? (focus)\n"
                        "2. What topics are they engaged with? (topics, max 5)\n"
                        "3. What kind of activity pattern? (coding, research, planning, debugging, writing)"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Projects:\n{proj_text}\n\nRecent activity:\n{mem_text}",
                },
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "focus": {"type": "string"},
                    "topics": {"type": "array", "items": {"type": "string"}},
                    "activity": {"type": "string"},
                },
            },
        )
        return result

    # ── Prediction ─────────────────────────────

    async def predict_needs(self) -> list[dict]:
        """
        Predict what the user will need based on:
        - Current context
        - Knowledge gaps
        - Calendar/planning patterns (future: integrate with calendar)
        """
        context = await self.detect_context()
        reflection = await self.engine.reflect()

        # Combine context + gaps to predict needs
        gaps = reflection.get("gaps", [])
        recommendations = reflection.get("recommendations", [])

        predictions = []

        # Match gaps to current context
        active_topics = context.get("active_topics", [])
        active_focus = context.get("current_focus", "")

        for gap in gaps:
            topic = gap.get("topic", "")
            # Check if gap is related to current focus
            relevance = self._calculate_context_relevance(
                topic, active_focus, active_topics
            )
            if relevance > 0.5:
                predictions.append({
                    "type": "knowledge_gap_alert",
                    "topic": topic,
                    "reason": gap.get("reason", ""),
                    "relevance": relevance,
                    "priority": gap.get("priority", 0.5) * relevance,
                    "action": f"Research {topic} to prepare for {active_focus}",
                })

        # Add recommendations relevant to context
        for rec in recommendations[:3]:
            predictions.append({
                "type": "recommendation",
                "topic": rec,
                "relevance": 0.6,
                "priority": 0.5,
                "action": rec,
            })

        # Sort by priority
        predictions.sort(key=lambda p: p["priority"], reverse=True)

        return predictions[:5]

    @staticmethod
    def _calculate_context_relevance(
        topic: str, focus: str, active_topics: list[str]
    ) -> float:
        """Simple relevance check between a topic and current context."""
        topic_lower = topic.lower()
        focus_lower = focus.lower()

        # Direct match with focus
        if topic_lower in focus_lower or focus_lower in topic_lower:
            return 1.0

        # Check against active topics
        for t in active_topics:
            if topic_lower in t.lower() or t.lower() in topic_lower:
                return 0.8

        # Keyword overlap
        topic_words = set(topic_lower.split())
        focus_words = set(focus_lower.split())
        overlap = topic_words & focus_words
        if overlap:
            return min(0.5 + len(overlap) * 0.1, 0.9)

        return 0.3

    # ── Push Logic ─────────────────────────────

    async def should_push(self) -> tuple[bool, Optional[list[dict]]]:
        """Determine if now is a good time to push information."""
        # Check cooldown
        if self._last_push_time:
            cooldown = self.proactive_cfg.get("push_cooldown", 30)
            elapsed = (now_utc() - self._last_push_time).total_seconds() / 60
            if elapsed < cooldown:
                return False, None

        # Check daily limit
        max_daily = self.proactive_cfg.get("max_daily_pushes", 5)
        if self._push_count_today >= max_daily:
            return False, None

        # Get predictions
        predictions = await self.predict_needs()

        # Filter by confidence threshold
        threshold = self.proactive_cfg.get("push_confidence", 0.7)
        high_conf = [p for p in predictions if p.get("relevance", 0) >= threshold]

        if high_conf:
            return True, high_conf[:3]

        return False, None

    async def generate_push_message(self, predictions: list[dict]) -> str:
        """Generate a human-readable push notification."""
        if not predictions:
            return ""

        # Format the top prediction into a message
        top = predictions[0]
        message = await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate a concise, helpful push notification based on the prediction. "
                        "Be warm but professional. Suggest concrete action. Use Chinese if the context is in Chinese. "
                        "Keep it under 150 characters."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Current focus: {top.get('topic', '')}\n"
                        f"Predicted need: {top.get('action', '')}\n"
                        f"Reason: {top.get('reason', '')}"
                    ),
                },
            ],
            temperature=0.7,
            max_tokens=200,
        )

        return message.strip()

    async def push(self) -> Optional[str]:
        """Execute a push cycle: check, format, deliver."""
        should, predictions = await self.should_push()

        if not should or not predictions:
            return None

        message = await self.generate_push_message(predictions)

        self._last_push_time = now_utc()
        self._push_count_today += 1

        # Desktop notification
        from core.notifier import get_notifier
        get_notifier().notify(
            "DeepSpace",
            message[:150],
            subtitle=f"Push #{self._push_count_today}",
        )

        logger.info(f"Push #{self._push_count_today}: {message[:80]}...")
        return message

    # ── Daily Briefing ─────────────────────────

    async def daily_briefing(self) -> str:
        """Generate a daily briefing of what DeepSpace has for the user."""
        context = await self.detect_context()
        reflection = await self.engine.reflect()
        stats = await self.engine.stats()

        briefing = await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate a concise daily briefing. Include:\n"
                        "1. What you're currently working on\n"
                        "2. Key knowledge gaps to address\n"
                        "3. One recommended action for today\n"
                        "Use Chinese. Keep under 300 characters."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Stats: {stats}\n"
                        f"Context: {context}\n"
                        f"Reflection gaps: {reflection.get('gaps', [])[:3]}\n"
                    ),
                },
            ],
            temperature=0.5,
            max_tokens=500,
        )

        return briefing.strip()