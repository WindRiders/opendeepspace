"""
Hermes Bridge — integrate DeepSpace with Hermes Agent's cronjob and messaging.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class HermesBridge:
    """
    Bridge between DeepSpace and Hermes Agent.
    
    Uses Hermes CLI for:
    - Cronjob scheduling (cronjob create/list/remove)
    - Message delivery (send_message)
    - Delegation (delegate_task)
    """

    def __init__(self, config: dict):
        hermes_cfg = config.get("hermes", {})
        self.enabled = hermes_cfg.get("enabled", True)
        self.cron_prefix = hermes_cfg.get("cron_prefix", "ds-")

    def _hermes_cli(self, *args) -> subprocess.CompletedProcess:
        """Run a Hermes CLI command."""
        cmd = ["hermes"] + list(args)
        logger.debug(f"Hermes CLI: {' '.join(cmd)}")
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    # ── Cronjob Management ─────────────────────

    def create_cronjob(
        self,
        name: str,
        prompt: str,
        schedule: str,
        skills: Optional[list[str]] = None,
        model: Optional[str] = None,
    ) -> Optional[str]:
        """
        Create a Hermes cronjob for DeepSpace.
        
        Returns job_id if successful.
        """
        if not self.enabled:
            logger.warning("Hermes bridge disabled, skipping cronjob creation")
            return None

        job_name = f"{self.cron_prefix}{name}"

        try:
            # Build the command as a JSON payload for the cronjob tool
            result = self._hermes_cli(
                "cronjob", "create",
                "--name", job_name,
                "--schedule", schedule,
                "--prompt", prompt,
            )

            if result.returncode == 0:
                # Parse job ID from output
                logger.info(f"Cronjob created: {job_name}")
                return job_name
            else:
                logger.error(f"Cronjob creation failed: {result.stderr}")
                return None

        except Exception as e:
            logger.error(f"Cronjob creation error: {e}")
            return None

    def list_cronjobs(self) -> list[str]:
        """List DeepSpace cronjobs."""
        try:
            result = self._hermes_cli("cronjob", "list")
            if result.returncode == 0:
                lines = result.stdout.split("\n")
                return [l for l in lines if self.cron_prefix in l]
        except Exception as e:
            logger.error(f"List cronjobs failed: {e}")
        return []

    def remove_cronjob(self, job_id: str) -> bool:
        """Remove a DeepSpace cronjob."""
        try:
            result = self._hermes_cli("cronjob", "remove", job_id)
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Remove cronjob failed: {e}")
            return False

    # ── Scheduled Tasks ────────────────────────

    def schedule_consolidation(self, interval_hours: int = 1) -> Optional[str]:
        """Schedule periodic memory consolidation."""
        return self.create_cronjob(
            name="consolidate",
            prompt=(
                "Run DeepSpace memory consolidation: "
                "cd ~/deepspace && .venv/bin/deepspace consolidate\n"
                "This consolidates short-term memories, promotes important ones, "
                "and updates the knowledge graph."
            ),
            schedule=f"0 */{interval_hours} * * *",
            skills=["deepspace"],
        )

    def schedule_learning_cycle(self, interval_minutes: int = 30) -> Optional[str]:
        """Schedule autonomous learning cycles."""
        return self.create_cronjob(
            name="learn",
            prompt=(
                "Run DeepSpace autonomous learning: "
                "cd ~/deepspace && .venv/bin/deepspace learn --once\n"
                "This researches knowledge gaps and stores findings."
            ),
            schedule=f"*/{interval_minutes} * * *",
            skills=["deepspace"],
        )

    def schedule_daily_briefing(self, time: str = "09:00") -> Optional[str]:
        """Schedule a daily briefing."""
        hour, minute = time.split(":")
        return self.create_cronjob(
            name="briefing",
            prompt=(
                "Generate DeepSpace daily briefing: "
                "cd ~/deepspace && .venv/bin/deepspace reflect\n"
                "This provides a knowledge summary, gaps, and recommendations."
            ),
            schedule=f"{minute} {hour} * * *",
            skills=["deepspace"],
        )

    def schedule_proactive_check(self, interval_minutes: int = 10) -> Optional[str]:
        """Schedule proactive context checks."""
        return self.create_cronjob(
            name="proactive",
            prompt=(
                "Run DeepSpace proactive check: "
                "cd ~/deepspace && .venv/bin/deepspace predict\n"
                "This detects user context and pushes relevant information."
            ),
            schedule=f"*/{interval_minutes} * * *",
            skills=["deepspace"],
        )

    # ── Messaging ──────────────────────────────

    def send_message(self, message: str, target: Optional[str] = None) -> bool:
        """
        Send a message through Hermes to the user.
        """
        try:
            args = ["send_message", "--message", message]
            if target:
                args.extend(["--target", target])

            result = self._hermes_cli(*args)
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Send message failed: {e}")
            return False

    def notify_user(self, title: str, body: str, priority: str = "normal") -> bool:
        """
        Send a structured notification to the user.
        """
        icons = {"high": "  ", "normal": "  ", "low": "  "}
        icon = icons.get(priority, "  ")

        message = f"{icon} **{title}**\n{body}"
        return self.send_message(message)

    # ── Setup All Schedules ────────────────────

    def setup_all_schedules(self) -> dict:
        """Set up all recommended cronjobs."""
        results = {}

        jobs = [
            ("consolidate", self.schedule_consolidation(1)),
            ("learn", self.schedule_learning_cycle(30)),
            ("daily_briefing", self.schedule_daily_briefing("09:00")),
            ("proactive", self.schedule_proactive_check(10)),
        ]

        for name, result in jobs:
            results[name] = "created" if result else "failed"

        return results