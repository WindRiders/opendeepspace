"""Timer plugin: timed/delayed action execution."""
import asyncio
from core.models import ActionResult, StepStatus
from core.plugin_manager import Plugin


class TimerToolPlugin(Plugin):
    """Adds 'timer' and 'countdown' action types."""

    async def on_load(self, manager):
        await super().on_load(manager)

    def get_execution_handlers(self):
        return {
            "timer": self._execute_timer,
            "countdown": self._execute_countdown,
        }

    async def _execute_timer(self, step, executor):
        """Execute after a delay. Command format: seconds|||message"""
        parts = step.command.split("|||", 1)
        delay = float(parts[0].strip() if len(parts) > 0 else "1")
        message = parts[1].strip() if len(parts) > 1 else "Timer done"

        import time
        start = time.time()
        await asyncio.sleep(delay)
        elapsed = time.time() - start

        return ActionResult(
            step_id=step.id, step_number=step.step_number,
            status=StepStatus.COMPLETED,
            stdout=f"Timer: {message} (waited {elapsed:.1f}s)",
            exit_code=0, duration_seconds=elapsed,
        )

    async def _execute_countdown(self, step, executor):
        """Countdown from N. Command format: seconds"""
        try:
            count = int(step.command.strip())
        except ValueError:
            count = 5

        outputs = []
        for i in range(count, 0, -1):
            outputs.append(str(i))
            await asyncio.sleep(0.1)

        return ActionResult(
            step_id=step.id, step_number=step.step_number,
            status=StepStatus.COMPLETED,
            stdout=f"Countdown: {' → '.join(outputs)} → done",
            exit_code=0, duration_seconds=count * 0.12,
        )