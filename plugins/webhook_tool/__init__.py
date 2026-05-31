"""Webhook plugin: call external webhooks."""
import json
import urllib.request
from core.models import ActionResult, StepStatus
from core.plugin_manager import Plugin


class WebhookToolPlugin(Plugin):
    """Adds 'webhook' action type for calling external APIs."""

    async def on_load(self, manager):
        await super().on_load(manager)

    def get_execution_handlers(self):
        return {"webhook": self._execute_webhook}

    async def _execute_webhook(self, step, executor):
        """Call a webhook. Command format: METHOD|||URL|||BODY"""
        parts = step.command.split("|||", 2)
        method = parts[0].strip().upper() if len(parts) > 0 else "POST"
        url = parts[1].strip() if len(parts) > 1 else ""
        body = parts[2].strip() if len(parts) > 2 else "{}"

        if not url:
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr="webhook requires METHOD|||URL|||BODY format",
                exit_code=-1,
            )

        try:
            req = urllib.request.Request(url, method=method)
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "DeepSpace-Webhook/1.0")
            if body and method in ("POST", "PUT", "PATCH"):
                req.data = body.encode()

            resp = urllib.request.urlopen(req, timeout=15)
            resp_body = resp.read().decode()[:500]
            import time
            start = time.time()

            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.COMPLETED if resp.status < 400 else StepStatus.FAILED,
                stdout=resp_body,
                exit_code=resp.status,
                duration_seconds=0.1,
            )
        except Exception as e:
            return ActionResult(
                step_id=step.id, step_number=step.step_number,
                status=StepStatus.FAILED,
                stderr=str(e),
                exit_code=-1,
            )