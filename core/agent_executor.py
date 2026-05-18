"""
Agent Executor — safe command execution sandbox for autonomous action.

Handles: shell commands, Python scripts, file writes, git operations, API calls.
Enforces safety policies: allowlist/blocklist, timeout, working directory scoping.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shlex
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from core.models import (
    ActionStep, ActionResult, StepStatus, now_utc,
)

logger = logging.getLogger(__name__)

# ── Safety: Dangerous command patterns ──────

DANGEROUS_PATTERNS = [
    r"\brm\s+-rf\s+/",           # rm -rf /
    r"\brm\s+-rf\s+~",           # rm -rf ~
    r"\brm\s+-rf\s+\$HOME",      # rm -rf $HOME
    r"\bdd\s+if=",               # dd (disk destroyer)
    r">\s*/dev/sd",              # Overwrite block device
    r"\bmkfs\.",                 # Format filesystem
    r":\(\)\s*\{\s*:",           # Fork bomb
    r"\bchmod\s+-R\s+777\s+/",   # chmod -R 777 /
    r"\bwget.*\|.*sh",           # curl/wget piped to shell
    r"\bcurl.*\|.*sh",           # curl piped to shell
    r"\bgit\s+push\s+--force.*origin\s+main",  # force push main
    r"\bgit\s+push\s+--force.*origin\s+master",
    r"\bsudo\b",                  # sudo (may prompt for password)
    r"\bsu\s+-",                 # su
]

SAFE_PATTERNS = [
    r"^ls\b",
    r"^cat\b",
    r"^head\b",
    r"^tail\b",
    r"^wc\b",
    r"^find\b",
    r"^grep\b",
    r"^rg\b",
    r"^echo\b",
    r"^pwd\b",
    r"^which\b",
    r"^whoami\b",
    r"^date\b",
    r"^uname\b",
    r"^env\b",
    r"^df\b",
    r"^du\b",
    r"^ps\b",
    r"^top\b",
    r"^docker\s+ps\b",
    r"^docker\s+logs\b",
    r"^docker\s+inspect\b",
    r"^docker\s+stats\b",
    r"^git\s+status\b",
    r"^git\s+log\b",
    r"^git\s+diff\b",
    r"^git\s+branch\b",
    r"^git\s+remote\b",
    r"^git\s+stash\b",
    r"^pip\s+list\b",
    r"^pip\s+show\b",
    r"^pip\s+freeze\b",
    r"^npm\s+list\b",
    r"^npm\s+view\b",
    r"^pnpm\s+list\b",
    r"^node\s+--version\b",
    r"^python.*--version\b",
    r"^python\s+-c\b",
    r"^curl\s+-s\b",
    r"^curl\s+--silent\b",
]

MODIFY_PATTERNS = [
    r"^mkdir\b",
    r"^touch\b",
    r"^cp\b",
    r"^mv\b",
    r"^pip\s+install\b",
    r"^npm\s+install\b",
    r"^pnpm\s+install\b",
    r"^pnpm\s+add\b",
    r"^git\s+add\b",
    r"^git\s+commit\b",
    r"^git\s+checkout\b",
    r"^git\s+switch\b",
    r"^git\s+merge\b",
    r"^git\s+rebase\b",
    r"^git\s+pull\b",
    r"^git\s+fetch\b",
    r"^git\s+push\b",
    r"^docker\s+start\b",
    r"^docker\s+stop\b",
    r"^docker\s+restart\b",
    r"^docker\s+compose\b",
    r"^python\s+\S+\.py\b",
    r"^pytest\b",
]


class SafetyChecker:
    """Checks commands against safety rules."""

    @staticmethod
    def is_dangerous(command: str) -> tuple[bool, str]:
        """Check if a command matches dangerous patterns. Returns (is_dangerous, reason)."""
        stripped = command.strip()
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, stripped):
                return True, f"Matched dangerous pattern: {pattern}"
        return False, ""

    @staticmethod
    def classify_command(command: str) -> str:
        """
        Classify a command as: safe, modify, dangerous, or unknown.
        """
        stripped = command.strip()
        if not stripped:
            return "unknown"

        # Check dangerous first
        is_dangerous, _ = SafetyChecker.is_dangerous(command)
        if is_dangerous:
            return "dangerous"

        # Check safe
        for pattern in SAFE_PATTERNS:
            if re.search(pattern, stripped):
                return "safe"

        # Check modify
        for pattern in MODIFY_PATTERNS:
            if re.search(pattern, stripped):
                return "modify"

        return "unknown"


class AgentExecutor:
    """
    Secure executor for autonomous agent actions.

    Features:
    - Safety pattern checking (dangerous command blocking)
    - Timeout enforcement per step
    - Working directory scoping
    - Output capture with size limits
    - Retry logic with backoff
    """

    MAX_OUTPUT_BYTES = 50_000  # 50KB max output

    def __init__(
        self,
        workdir: str = ".",
        mode: str = "semi_auto",    # plan_only | step_by_step | semi_auto | full_auto
        default_timeout: int = 120,
        allow_dangerous: bool = False,
    ):
        self.workdir = Path(workdir).resolve()
        self.mode = mode
        self.default_timeout = default_timeout
        self.allow_dangerous = allow_dangerous
        self._execution_history: list[ActionResult] = []

    # ── Main Execution ──────────────────────────

    async def execute_step(self, step: ActionStep) -> ActionResult:
        """
        Execute a single action step. Returns ActionResult with all output.
        """
        start_time = asyncio.get_event_loop().time()

        # Pre-execution safety check
        command = step.command.strip()
        if step.action_type == "shell" and command:
            classification = SafetyChecker.classify_command(command)

            if classification == "dangerous" and not self.allow_dangerous:
                _, reason = SafetyChecker.is_dangerous(command)
                return ActionResult(
                    step_id=step.id,
                    step_number=step.step_number,
                    status=StepStatus.FAILED,
                    stderr=f"SAFETY BLOCK: {reason}",
                    exit_code=-1,
                )

            if classification == "dangerous" and self.mode not in ("full_auto",):
                return ActionResult(
                    step_id=step.id,
                    step_number=step.step_number,
                    status=StepStatus.APPROVAL_REQUIRED,
                    stderr=f"Dangerous command requires approval: {command[:100]}",
                    exit_code=-1,
                )

        # Execute based on action type
        result = await self._execute_by_type(step, start_time)

        self._execution_history.append(result)
        return result

    async def _execute_by_type(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Dispatch execution based on action_type."""

        if step.action_type == "shell":
            return await self._run_shell(step, start_time)

        elif step.action_type == "python":
            return await self._run_python(step, start_time)

        elif step.action_type == "file_write":
            return await self._do_file_write(step, start_time)

        elif step.action_type == "git":
            return await self._run_git(step, start_time)

        elif step.action_type == "api_call":
            return await self._do_api_call(step, start_time)

        else:
            duration = asyncio.get_event_loop().time() - start_time
            return ActionResult(
                step_id=step.id,
                step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr=f"Unknown action type: {step.action_type}",
                exit_code=-1,
                duration_seconds=round(duration, 2),
            )

    # ── Shell Execution ─────────────────────────

    async def _run_shell(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Run a shell command with timeout and capture."""
        timeout = min(step.timeout_seconds, 600)  # Hard cap at 10 min

        try:
            proc = await asyncio.create_subprocess_shell(
                step.command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.workdir),
            )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )

            stdout = stdout_bytes.decode("utf-8", errors="replace")[:self.MAX_OUTPUT_BYTES]
            stderr = stderr_bytes.decode("utf-8", errors="replace")[:self.MAX_OUTPUT_BYTES]
            duration = round(asyncio.get_event_loop().time() - start_time, 2)

            status = StepStatus.COMPLETED if proc.returncode == 0 else StepStatus.FAILED

            return ActionResult(
                step_id=step.id,
                step_number=step.step_number,
                status=status,
                stdout=stdout,
                stderr=stderr,
                exit_code=proc.returncode or 0,
                duration_seconds=duration,
            )

        except asyncio.TimeoutError:
            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id,
                step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr=f"Command timed out after {timeout}s",
                exit_code=-1,
                duration_seconds=duration,
            )
        except Exception as e:
            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id,
                step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr=str(e),
                exit_code=-1,
                duration_seconds=duration,
            )

    # ── Python Execution ────────────────────────

    async def _run_python(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Execute a Python script in a subprocess."""
        return await self._run_shell(
            ActionStep(
                id=step.id,
                step_number=step.step_number,
                description=step.description,
                action_type="shell",
                command=f"python3 -c {shlex.quote(step.command)}",
                timeout_seconds=step.timeout_seconds,
            ),
            start_time,
        )

    # ── File Write ──────────────────────────────

    async def _do_file_write(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Write content to a file within workdir scope."""
        try:
            # Parse command as "filepath|||content"
            parts = step.command.split("|||", 1)
            if len(parts) != 2:
                return ActionResult(
                    step_id=step.id, step_number=step.step_number,
                    status=StepStatus.FAILED,
                    stderr="file_write requires format: filepath|||content",
                    exit_code=-1,
                )

            filepath = Path(parts[0].strip())
            content = parts[1]

            # Resolve relative to workdir, prevent escape
            if not filepath.is_absolute():
                filepath = self.workdir / filepath
            filepath = filepath.resolve()

            if not str(filepath).startswith(str(self.workdir)):
                return ActionResult(
                    step_id=step.id, step_number=step.step_number,
                    status=StepStatus.FAILED,
                    stderr=f"Path escapes workdir: {filepath}",
                    exit_code=-1,
                )

            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(content)

            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.COMPLETED,
                stdout=f"Written {len(content)} bytes to {filepath}",
                exit_code=0, duration_seconds=duration,
            )

        except Exception as e:
            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.FAILED, stderr=str(e),
                exit_code=-1, duration_seconds=duration,
            )

    # ── Git Operations ──────────────────────────

    async def _run_git(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Run a git command prefixed with 'git '."""
        cmd = step.command.strip()
        if not cmd.startswith("git "):
            cmd = f"git {cmd}"
        return await self._run_shell(
            ActionStep(
                id=step.id, step_number=step.step_number,
                description=step.description,
                action_type="shell", command=cmd,
                timeout_seconds=step.timeout_seconds,
            ),
            start_time,
        )

    # ── API Call ────────────────────────────────

    async def _do_api_call(
        self, step: ActionStep, start_time: float
    ) -> ActionResult:
        """Make an HTTP API call. Command format: METHOD|||URL|||BODY"""
        parts = step.command.split("|||", 2)
        method = parts[0].strip().upper() if len(parts) > 0 else "GET"
        url = parts[1].strip() if len(parts) > 1 else ""

        if not url:
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr="api_call requires METHOD|||URL|||BODY format",
                exit_code=-1,
            )

        body = parts[2] if len(parts) > 2 else ""

        import urllib.request
        import json as _json

        try:
            req = urllib.request.Request(url, method=method)
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "DeepSpace-Agent/1.0")
            if body:
                req.data = body.encode()

            resp = urllib.request.urlopen(req, timeout=30)
            resp_body = resp.read().decode()[:self.MAX_OUTPUT_BYTES]

            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.COMPLETED,
                stdout=resp_body,
                exit_code=resp.status,
                duration_seconds=duration,
            )
        except Exception as e:
            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.FAILED, stderr=str(e),
                exit_code=-1, duration_seconds=duration,
            )

    # ── Retry Logic ─────────────────────────────

    async def execute_with_retry(self, step: ActionStep) -> ActionResult:
        """Execute a step with retry on failure."""
        last_result = None

        for attempt in range(step.max_retries + 1):
            step.retry_count = attempt
            step.status = StepStatus.IN_PROGRESS
            step.started_at = now_utc()

            result = await self.execute_step(step)
            result.retry_attempt = attempt

            if result.status == StepStatus.COMPLETED:
                step.status = StepStatus.COMPLETED
                step.completed_at = now_utc()
                return result

            if result.status == StepStatus.APPROVAL_REQUIRED:
                step.status = StepStatus.APPROVAL_REQUIRED
                return result

            last_result = result
            logger.warning(
                f"Step {step.step_number} failed (attempt {attempt+1}/{step.max_retries+1}): "
                f"{result.stderr[:100]}"
            )

            if attempt < step.max_retries:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff

        step.status = StepStatus.FAILED
        step.completed_at = now_utc()
        return last_result or ActionResult(
            step_id=step.id, step_number=step.step_number,
            status=StepStatus.FAILED,
            stderr="All retry attempts exhausted",
            exit_code=-1,
        )

    @property
    def history(self) -> list[ActionResult]:
        return list(self._execution_history)