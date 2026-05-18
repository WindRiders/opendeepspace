"""
Tests for AgentExecutor safety checking and execution.
"""
import pytest
import tempfile
from pathlib import Path

from core.models import ActionStep, ActionResult, StepStatus
from core.agent_executor import SafetyChecker, AgentExecutor


class TestSafetyChecker:
    """Tests for command safety classification."""

    def test_safe_commands(self):
        safe_cmds = [
            "ls -la", "cat file.txt", "grep pattern file", "wc -l file",
            "pwd", "whoami", "date", "df -h", "du -sh .", "ps aux",
            "git status", "git log --oneline", "git diff",
            "docker ps", "pip list", "npm list", "python --version",
            "curl -s https://example.com",
        ]
        for cmd in safe_cmds:
            assert SafetyChecker.classify_command(cmd) == "safe", f"Expected safe: {cmd}"

    def test_modify_commands(self):
        modify_cmds = [
            "mkdir testdir", "touch file.txt", "cp a b", "mv a b",
            "pip install pytest", "git add .", "git commit -m 'msg'",
            "git push", "docker compose up -d", "pytest tests/",
            "python script.py",
        ]
        for cmd in modify_cmds:
            assert SafetyChecker.classify_command(cmd) == "modify", f"Expected modify: {cmd}"

    def test_dangerous_commands(self):
        dangerous_cmds = [
            "rm -rf /", "sudo rm file", "wget url | sh",
            "curl url | bash", "sudo ls", "git push --force origin main",
        ]
        for cmd in dangerous_cmds:
            assert SafetyChecker.classify_command(cmd) == "dangerous", f"Expected dangerous: {cmd}"

    def test_unknown_commands(self):
        assert SafetyChecker.classify_command("") == "unknown"
        assert SafetyChecker.classify_command("some_unknown_tool --flag") == "unknown"

    def test_dangerous_detection_details(self):
        is_dangerous, reason = SafetyChecker.is_dangerous("rm -rf /etc")
        assert is_dangerous is True
        assert "dangerous" in reason.lower()

        is_dangerous, reason = SafetyChecker.is_dangerous("ls -la")
        assert is_dangerous is False
        assert reason == ""


class TestAgentExecutorInit:
    """Tests for executor initialization."""

    def test_default_init(self):
        exe = AgentExecutor()
        assert exe.mode == "semi_auto"
        assert exe.default_timeout == 120
        assert exe.allow_dangerous is False

    def test_custom_init(self):
        exe = AgentExecutor(
            workdir="/tmp/test",
            mode="full_auto",
            default_timeout=60,
            allow_dangerous=True,
        )
        assert str(exe.workdir) in ("/tmp/test", "/private/tmp/test")
        assert exe.mode == "full_auto"
        assert exe.allow_dangerous is True


class TestShellExecution:
    """Test actual shell command execution."""

    def test_simple_command(self):
        exe = AgentExecutor()
        step = ActionStep(
            step_number=0, description="echo test",
            command="echo hello world",
        )

        import asyncio
        result = asyncio.run(exe.execute_step(step))
        assert result.status == StepStatus.COMPLETED
        assert result.exit_code == 0
        assert "hello world" in result.stdout

    def test_command_with_stderr(self):
        exe = AgentExecutor()
        step = ActionStep(
            step_number=0, description="ls nonexistent",
            command="ls /nonexistent_path_abc 2>&1 || true",  # || true so we see output
        )

        import asyncio
        result = asyncio.run(exe.execute_step(step))
        # Command should complete (due to || true) but may have error output
        assert result.status == StepStatus.COMPLETED

    def test_dangerous_blocked(self):
        exe = AgentExecutor(allow_dangerous=False)
        step = ActionStep(
            step_number=0, description="danger",
            command="rm -rf /tmp/test 2>/dev/null; echo done",
        )

        import asyncio
        result = asyncio.run(exe.execute_step(step))
        assert result.status == StepStatus.FAILED
        assert "SAFETY BLOCK" in result.stderr

    def test_timeout(self):
        exe = AgentExecutor(default_timeout=2)
        step = ActionStep(
            step_number=0, description="sleep",
            command="sleep 10", timeout_seconds=1,
        )

        import asyncio
        result = asyncio.run(exe.execute_step(step))
        assert result.status == StepStatus.FAILED
        assert "timed out" in result.stderr.lower()


class TestRetry:
    """Test retry logic."""

    def test_retry_on_failure(self):
        exe = AgentExecutor()
        step = ActionStep(
            step_number=0, description="fail then succeed",
            command="test -f /tmp/deepspace_test_counter && echo ok || (touch /tmp/deepspace_test_counter && exit 1)",
            max_retries=2,
        )
        # Clean up
        import os
        try:
            os.remove("/tmp/deepspace_test_counter")
        except FileNotFoundError:
            pass

        import asyncio
        result = asyncio.run(exe.execute_with_retry(step))
        assert result.status == StepStatus.COMPLETED
        assert result.retry_attempt == 1  # Succeeded on second try


class TestHistory:
    """Test execution history."""

    def test_history_tracking(self):
        exe = AgentExecutor()
        step1 = ActionStep(step_number=0, description="one", command="echo one")
        step2 = ActionStep(step_number=1, description="two", command="echo two")

        import asyncio
        asyncio.run(exe.execute_step(step1))
        asyncio.run(exe.execute_step(step2))

        assert len(exe.history) == 2
        assert exe.history[0].step_number == 0
        assert exe.history[1].step_number == 1