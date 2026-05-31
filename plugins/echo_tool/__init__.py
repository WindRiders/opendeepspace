"""Example plugin: echo action type."""
from core.plugin_manager import Plugin


class EchoToolPlugin(Plugin):
    """Simple plugin that adds an 'echo' action type."""

    async def on_load(self, manager):
        await super().on_load(manager)

    def get_action_handlers(self):
        return {"echo": self._handle_echo}

    def get_execution_handlers(self):
        return {
            "echo": self._execute_echo,
        }

    async def _handle_echo(self, **kwargs):
        return {"echo": kwargs.get("message", "no message")}

    async def _execute_echo(self, step, executor):
        """Execute an echo action — just returns the command as output."""
        from core.models import ActionResult, StepStatus
        return ActionResult(
            step_id=step.id,
            step_number=step.step_number,
            status=StepStatus.COMPLETED,
            stdout=f"ECHO: {step.command}",
            exit_code=0,
            duration_seconds=0.01,
        )