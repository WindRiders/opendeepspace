"""
Timeline Generator — visualize memories, executions, and projects across time.

Provides chronological views for understanding DeepSpace's evolution.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.models import Memory, MemoryLayer, now_utc

logger = logging.getLogger(__name__)


class TimelineGenerator:
    """Generate timeline data from memories, executions, and projects."""

    def __init__(self, memory_engine, orchestrator=None):
        self.engine = memory_engine
        self.orch = orchestrator

    async def get_memory_timeline(
        self,
        days: int = 30,
        layer: Optional[MemoryLayer] = None,
        limit: int = 200,
    ) -> list[dict]:
        """Get a chronological list of memories."""
        cutoff = now_utc() - timedelta(days=days)

        all_memories = []
        layers = [layer] if layer else list(MemoryLayer)
        for l in layers:
            mems = await self.engine.vector_store.get_by_layer(l, limit=limit // len(layers))
            all_memories.extend(mems)

        # Filter by date
        filtered = [m for m in all_memories if m.created_at >= cutoff]
        # Sort chronologically
        filtered.sort(key=lambda m: m.created_at)

        return [
            {
                "date": m.created_at.isoformat(),
                "id": m.id,
                "content": m.content[:200],
                "type": m.memory_type.value,
                "layer": m.layer.value,
                "importance": m.importance,
                "project": m.project,
            }
            for m in filtered
        ]

    async def get_execution_timeline(self, limit: int = 50) -> list[dict]:
        """Get chronological execution history."""
        if not self.orch:
            return []

        history = self.orch.execution_history[-limit:]
        return sorted(history, key=lambda h: h.get("timestamp", ""))

    async def get_full_timeline(self, days: int = 30, limit: int = 100) -> dict:
        """
        Get a unified timeline with memories, executions, and milestones.

        Returns a single chronological feed of all events.
        """
        events = []

        # Memories
        memories = await self.get_memory_timeline(days=days, limit=limit)
        for m in memories:
            events.append({
                "type": "memory",
                "date": m["date"],
                "title": m["content"][:80],
                "detail": m,
            })

        # Executions
        if self.orch:
            executions = await self.get_execution_timeline(limit=limit)
            for e in executions:
                events.append({
                    "type": "execution",
                    "date": e.get("timestamp", ""),
                    "title": e.get("goal", "")[:80],
                    "outcome": e.get("outcome", "unknown"),
                    "passed": e.get("steps_passed", 0),
                    "total": e.get("steps_total", 0),
                    "detail": e,
                })

        # Sort all events chronologically
        events.sort(key=lambda e: e.get("date", ""))

        # Group by day
        from collections import defaultdict
        by_day = defaultdict(list)
        for e in events:
            day = e["date"][:10] if e["date"] else "unknown"
            by_day[day].append(e)

        # Build timeline groups
        timeline = []
        for day in sorted(by_day.keys(), reverse=True):
            day_events = by_day[day]
            timeline.append({
                "date": day,
                "event_count": len(day_events),
                "memories": sum(1 for e in day_events if e["type"] == "memory"),
                "executions": sum(1 for e in day_events if e["type"] == "execution"),
                "events": day_events[:20],
            })

        return {
            "days": len(timeline),
            "total_events": len(events),
            "span_days": days,
            "timeline": timeline,
        }

    async def get_project_timeline(self, project: str, days: int = 60) -> dict:
        """Get timeline for a specific project."""
        mems = await self.get_memory_timeline(days=days, limit=500)

        project_mems = [m for m in mems if m.get("project") == project]
        project_mems.sort(key=lambda m: m.get("date", ""))

        milestones = self._detect_milestones(project_mems)

        return {
            "project": project,
            "memories": len(project_mems),
            "span_days": days,
            "first_activity": project_mems[0]["date"] if project_mems else None,
            "last_activity": project_mems[-1]["date"] if project_mems else None,
            "milestones": milestones,
            "timeline": project_mems,
        }

    def _detect_milestones(self, memories: list[dict]) -> list[dict]:
        """Detect important milestones from memory patterns."""
        milestones = []
        # High importance memories = milestones
        for m in memories:
            if m.get("importance", 0) >= 0.8:
                milestones.append({
                    "date": m["date"],
                    "title": m["content"][:100],
                    "importance": m["importance"],
                })
        # Also: first memory of each day, type transitions
        return milestones[:20]