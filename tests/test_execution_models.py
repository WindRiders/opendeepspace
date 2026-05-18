"""
Tests for autonomous execution models.
"""
import pytest
from core.models import (
    Goal, ExecutionPlan, ActionStep, ActionResult,
    VerificationResult, StepStatus, ExecutionMode, now_utc,
)


class TestStepStatus:
    def test_all_statuses(self):
        expected = {"pending", "in_progress", "completed", "failed", "skipped", "approval_required"}
        assert {s.value for s in StepStatus} == expected


class TestExecutionMode:
    def test_all_modes(self):
        expected = {"plan_only", "step_by_step", "semi_auto", "full_auto"}
        assert {m.value for m in ExecutionMode} == expected


class TestGoal:
    def test_goal_defaults(self):
        g = Goal(description="Fix the bug")
        assert g.description == "Fix the bug"
        assert g.mode == ExecutionMode.SEMI_AUTO
        assert g.status == StepStatus.PENDING
        assert g.completed_at is None
        assert len(g.id) == 16

    def test_goal_with_context(self):
        g = Goal(description="Deploy app", context="production environment", mode=ExecutionMode.STEP_BY_STEP)
        assert g.context == "production environment"
        assert g.mode == ExecutionMode.STEP_BY_STEP


class TestActionStep:
    def test_step_defaults(self):
        s = ActionStep(step_number=0, description="Check status", command="docker ps")
        assert s.step_number == 0
        assert s.action_type == "shell"
        assert s.status == StepStatus.PENDING
        assert s.timeout_seconds == 120
        assert s.max_retries == 2
        assert s.retry_count == 0

    def test_step_with_dependencies(self):
        s = ActionStep(step_number=2, description="Test", command="pytest", dependencies=[0, 1])
        assert s.dependencies == [0, 1]

    def test_step_types(self):
        shell = ActionStep(step_number=0, description="s", command="ls")
        assert shell.action_type == "shell"

        py = ActionStep(step_number=1, description="p", action_type="python", command="print(1)")
        assert py.action_type == "python"

        fw = ActionStep(step_number=2, description="f", action_type="file_write", command="test.txt|||content")
        assert fw.action_type == "file_write"


class TestActionResult:
    def test_result_defaults(self):
        r = ActionResult(step_id="s1", step_number=0, status=StepStatus.COMPLETED)
        assert r.status == StepStatus.COMPLETED
        assert r.exit_code == -1
        assert r.stdout == ""
        assert r.stderr == ""
        assert r.retry_attempt == 0

    def test_result_with_output(self):
        r = ActionResult(
            step_id="s1", step_number=0, status=StepStatus.COMPLETED,
            stdout="output", exit_code=0, duration_seconds=1.5,
        )
        assert r.stdout == "output"
        assert r.exit_code == 0
        assert r.duration_seconds == 1.5


class TestVerificationResult:
    def test_verification_pass(self):
        v = VerificationResult(
            step_id="s1", step_number=0, passed=True,
            evidence="Output matches", confidence=0.95,
        )
        assert v.passed is True
        assert v.confidence == 0.95

    def test_verification_fail(self):
        v = VerificationResult(
            step_id="s1", step_number=0, passed=False,
            evidence="Output doesn't match",
            suggestion="Check command arguments",
        )
        assert v.passed is False
        assert "Check command arguments" in v.suggestion


class TestExecutionPlan:
    def test_empty_plan(self):
        g = Goal(description="test")
        p = ExecutionPlan(goal=g)
        assert p.steps == []
        assert p.completed_steps == 0
        assert p.failed_steps == 0
        assert p.is_complete is True  # vacuously true

    def test_plan_with_steps(self):
        g = Goal(description="test")
        s1 = ActionStep(step_number=0, description="one", command="ls")
        s2 = ActionStep(step_number=1, description="two", command="pwd")

        p = ExecutionPlan(goal=g, steps=[s1, s2], rationale="testing")
        assert len(p.steps) == 2
        assert p.rationale == "testing"

    def test_completed_steps_count(self):
        g = Goal(description="test")
        s1 = ActionStep(step_number=0, description="one", command="ls", status=StepStatus.COMPLETED)
        s2 = ActionStep(step_number=1, description="two", command="pwd", status=StepStatus.COMPLETED)
        s3 = ActionStep(step_number=2, description="three", command="wc", status=StepStatus.FAILED)

        p = ExecutionPlan(goal=g, steps=[s1, s2, s3])
        assert p.completed_steps == 2
        assert p.failed_steps == 1
        assert p.is_complete is False