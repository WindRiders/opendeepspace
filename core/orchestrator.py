"""
Agent Orchestrator — multi-agent coordination for DeepSpace.
Manages specialized agents: Research, Memory, Graph, Planning, Reflection,
Action, Verification — full autonomous execution pipeline.
"""
from __future__ import annotations

import asyncio
import logging
from enum import Enum
from typing import Optional

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.proactive_service import ProactiveService
from core.autonomous_learner import AutonomousLearner
from core.agent_executor import AgentExecutor, SafetyChecker
from core.models import (
    Memory, MemoryLayer, MemoryType, now_utc,
    Goal, ExecutionPlan, ActionStep, ActionResult,
    VerificationResult, StepStatus, ExecutionMode,
)

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    EXECUTIVE = "executive"           # Coordinates all agents
    RESEARCH = "research"             # Searches and learns
    MEMORY = "memory"                 # Manages memories
    GRAPH = "graph"                   # Maintains knowledge graph
    PLANNING = "planning"             # Task decomposition and planning
    ACTION = "action"                 # Executes planned steps safely
    VERIFICATION = "verification"     # Verifies action outcomes
    REFLECTION = "reflection"         # Meta-cognition
    PROACTIVE = "proactive"           # Context monitoring and push


class Orchestrator:
    """
    Multi-agent orchestrator with autonomous execution capability.

    Pipeline: Goal → Plan → Execute → Verify → Learn → Update Goal
    """

    def __init__(
        self,
        engine: MemoryEngine,
        llm: LLMClient,
        config: dict,
    ):
        self.engine = engine
        self.llm = llm
        self.config = config
        self.learner = AutonomousLearner(engine, llm, config)
        self.proactive = ProactiveService(engine, llm, config)

        # Execution engine
        exec_cfg = config.get("execution", {})
        self.executor = AgentExecutor(
            workdir=exec_cfg.get("workdir", "."),
            mode=exec_cfg.get("mode", "semi_auto"),
            default_timeout=exec_cfg.get("default_timeout", 120),
            allow_dangerous=exec_cfg.get("allow_dangerous", False),
        )

        self._running = False
        self._tasks: dict[str, asyncio.Task] = {}
        self._execution_history: list[dict] = []  # Store solve results

    # ── Agent Dispatch ─────────────────────────

    async def dispatch(self, role: AgentRole, **kwargs) -> dict:
        """Dispatch a task to a specific agent."""
        dispatcher = {
            AgentRole.RESEARCH: self._agent_research,
            AgentRole.MEMORY: self._agent_memory,
            AgentRole.GRAPH: self._agent_graph,
            AgentRole.PLANNING: self._agent_planning,
            AgentRole.ACTION: self._agent_action,
            AgentRole.VERIFICATION: self._agent_verification,
            AgentRole.REFLECTION: self._agent_reflection,
            AgentRole.PROACTIVE: self._agent_proactive,
        }

        handler = dispatcher.get(role)
        if not handler:
            return {"error": f"Unknown agent role: {role}"}

        return await handler(**kwargs)

    # ── Research Agent ─────────────────────────

    async def _agent_research(self, query: str = "", **kwargs) -> dict:
        """Research Agent: search and synthesize."""
        task = await self.learner.check_and_learn(force=True)
        if task and task.status.value == "completed":
            return {
                "role": "research",
                "status": "completed",
                "title": task.title,
                "findings": task.findings[:500],
            }
        return {"role": "research", "status": "no_task"}

    # ── Memory Agent ───────────────────────────

    async def _agent_memory(
        self, action: str = "stats", memory_id: str = "", **kwargs
    ) -> dict:
        """Memory Agent: manage memories."""
        if action == "stats":
            stats = await self.engine.stats()
            return {"role": "memory", "action": "stats", "data": stats}
        elif action == "get" and memory_id:
            mem = await self.engine.get_memory(memory_id)
            return {"role": "memory", "action": "get", "memory": mem}
        elif action == "consolidate":
            result = await self.engine.consolidate()
            return {"role": "memory", "action": "consolidate", "result": result}
        return {"role": "memory", "action": action, "status": "ok"}

    # ── Graph Agent ────────────────────────────

    async def _agent_graph(self, query: str = "", **kwargs) -> dict:
        """Graph Agent: knowledge graph operations."""
        entities = await self.engine.graph_store.search_entities(query, top_k=10)
        return {
            "role": "graph",
            "query": query,
            "entities": [
                {"name": e.name, "type": e.entity_type.value}
                for e in entities
            ],
        }

    # ── Planning Agent ─────────────────────────

    async def _agent_planning(self, goal_description: str = "", **kwargs) -> dict:
        """Planning Agent: decompose goals into executable steps."""
        if not goal_description:
            return {"role": "planning", "error": "No goal provided"}

        context = await self.proactive.detect_context()
        reflection = await self.engine.reflect()

        plan = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a planning agent. Decompose the user's goal into "
                        "concrete, executable shell commands. "
                        "Return 3-7 steps. Each step must have:\n"
                        "- description: what this step does\n"
                        "- command: the exact shell command to run\n"
                        "- action_type: shell, git, file_write, or python\n"
                        "- expected_outcome: what success looks like\n"
                        "- dependencies: list of step numbers (0-indexed) that must complete first\n"
                        "Make commands safe and specific. Prefer read-only commands "
                        "when possible. Consider the current context."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Goal: {goal_description}\n"
                        f"Current context: {context}\n"
                        f"Knowledge gaps: {reflection.get('gaps', [])[:5]}"
                    ),
                },
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "action_type": {"type": "string", "enum": ["shell", "python", "file_write", "git", "api_call"]},
                                "command": {"type": "string"},
                                "expected_outcome": {"type": "string"},
                                "dependencies": {"type": "array", "items": {"type": "integer"}},
                            },
                            "required": ["description", "command"],
                        },
                    },
                    "rationale": {"type": "string"},
                    "estimated_total_minutes": {"type": "integer"},
                },
            },
        )
        return {"role": "planning", "goal": goal_description, "plan": plan}

    # ── Action Agent (NEW) ─────────────────────

    async def _agent_action(
        self, step: Optional[ActionStep] = None, step_dict: Optional[dict] = None,
        **kwargs
    ) -> dict:
        """Action Agent: execute a single step safely."""
        if step_dict and not step:
            step = ActionStep(**step_dict)

        if not step:
            return {"role": "action", "error": "No step provided"}

        result = await self.executor.execute_with_retry(step)

        # Summarize output for memory
        if result.stdout:
            try:
                summary = await self.llm.summarize(result.stdout[:2000])
                result.output_summary = summary
            except Exception:
                result.output_summary = result.stdout[:200]

        # Analyze errors
        if result.status == StepStatus.FAILED and result.stderr:
            try:
                analysis = await self.llm.chat(
                    messages=[
                        {"role": "system", "content": "Analyze this command failure in one sentence. What went wrong?"},
                        {"role": "user", "content": f"Command: {step.command}\nStderr: {result.stderr[:500]}"},
                    ],
                    max_tokens=150,
                )
                result.error_analysis = analysis.strip()
            except Exception:
                result.error_analysis = result.stderr[:200]

        return {
            "role": "action",
            "step": step.model_dump(),
            "result": result.model_dump(),
        }

    # ── Verification Agent (NEW) ───────────────

    async def _agent_verification(
        self, step: Optional[ActionStep] = None, result: Optional[ActionResult] = None,
        step_dict: Optional[dict] = None, result_dict: Optional[dict] = None,
        **kwargs
    ) -> dict:
        """Verification Agent: verify an action's outcome."""
        if step_dict and not step:
            step = ActionStep(**step_dict)
        if result_dict and not result:
            result = ActionResult(**result_dict)

        if not step or not result:
            return {"role": "verification", "error": "Step and result required"}

        # Quick path: already failed
        if result.status == StepStatus.FAILED:
            return {
                "role": "verification",
                "verification": VerificationResult(
                    step_id=step.id, step_number=step.step_number,
                    passed=False,
                    evidence=f"Step failed with exit code {result.exit_code}: {result.stderr[:200]}",
                    confidence=0.95,
                    suggestion="Fix the error and retry, or skip this step if non-critical.",
                ).model_dump(),
            }

        # LLM-based verification
        verification = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Verify whether a command executed successfully. Compare "
                        "actual output against expected outcome. Be strict but fair. "
                        "If output matches expectations, pass. If unclear, note why."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Command: {step.command}\n"
                        f"Expected outcome: {step.expected_outcome}\n"
                        f"Exit code: {result.exit_code}\n"
                        f"Stdout: {result.stdout[:1000]}\n"
                        f"Stderr: {result.stderr[:500]}"
                    ),
                },
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "passed": {"type": "boolean"},
                    "evidence": {"type": "string"},
                    "confidence": {"type": "number"},
                    "suggestion": {"type": "string"},
                },
            },
        )

        return {
            "role": "verification",
            "verification": VerificationResult(
                step_id=step.id,
                step_number=step.step_number,
                passed=verification.get("passed", result.exit_code == 0),
                evidence=verification.get("evidence", ""),
                confidence=float(verification.get("confidence", 0.7)),
                suggestion=verification.get("suggestion", ""),
            ).model_dump(),
        }

    # ── Reflection Agent ───────────────────────

    async def _agent_reflection(self, **kwargs) -> dict:
        """Reflection Agent: meta-cognition."""
        result = await self.engine.reflect()
        return {"role": "reflection", "data": result}

    # ── Proactive Agent ────────────────────────

    async def _agent_proactive(self, **kwargs) -> dict:
        """Proactive Agent: context monitoring and push."""
        context = await self.proactive.detect_context()
        predictions = await self.proactive.predict_needs()
        return {
            "role": "proactive",
            "context": context,
            "predictions": predictions[:3],
        }

    # ── SOLVE: Full Autonomous Pipeline (NEW) ──

    async def solve_goal(
        self,
        description: str,
        context: str = "",
        mode: ExecutionMode = ExecutionMode.SEMI_AUTO,
    ) -> dict:
        """
        Full autonomous solve pipeline:
        Goal → Plan → Execute → Verify → Learn

        This is THE entry point for autonomous problem-solving.
        """
        results = {
            "goal": description,
            "mode": mode.value,
            "plan": None,
            "execution": [],
            "verification": [],
            "outcome": "pending",
        }

        # Phase 1: Create Goal
        goal = Goal(description=description, context=context, mode=mode)
        logger.info(f"SOLVE: Goal created — {description[:80]}")

        # Phase 2: Plan
        plan_result = await self._agent_planning(goal_description=description)
        plan_data = plan_result.get("plan", {})

        steps = []
        for i, step_data in enumerate(plan_data.get("steps", [])):
            step = ActionStep(
                step_number=i,
                description=step_data.get("description", ""),
                action_type=step_data.get("action_type", "shell"),
                command=step_data.get("command", ""),
                expected_outcome=step_data.get("expected_outcome", ""),
                dependencies=step_data.get("dependencies", []),
            )
            steps.append(step)

        execution_plan = ExecutionPlan(
            goal=goal,
            steps=steps,
            rationale=plan_data.get("rationale", ""),
            estimated_total_minutes=plan_data.get("estimated_total_minutes", 0),
        )

        results["plan"] = {
            "rationale": execution_plan.rationale,
            "steps": [{"number": s.step_number, "description": s.description, "command": s.command} for s in steps],
            "estimated_total_minutes": execution_plan.estimated_total_minutes,
        }

        if mode == ExecutionMode.PLAN_ONLY:
            results["outcome"] = "planned_only"
            return results

# Phase 3: Execute + Verify (step by step, with autonomous recovery)
        for step in execution_plan.steps:
            # Check dependencies
            deps_satisfied = all(
                execution_plan.steps[dep].status == StepStatus.COMPLETED
                for dep in step.dependencies
                if dep < len(execution_plan.steps)
            )
            if not deps_satisfied:
                step.status = StepStatus.SKIPPED
                continue

            # Execute
            action_result = await self._agent_action(step=step)
            exec_data = action_result.get("result", {})

            # Verify
            verify_result = await self._agent_verification(
                step=step,
                result=ActionResult(**exec_data) if exec_data else ActionResult(
                    step_id=step.id, step_number=step.step_number,
                    status=StepStatus.FAILED,
                ),
            )

            verification = verify_result.get("verification", {})
            passed = verification.get("passed", False)

            # ── Autonomous Recovery (NEW) ──
            recovery_attempts = 0
            if not passed and mode in (ExecutionMode.SEMI_AUTO, ExecutionMode.FULL_AUTO):
                while recovery_attempts < 2:
                    recovery_attempts += 1
                    logger.info(
                        f"RECOVERY: Step {step.step_number} failed — "
                        f"attempting autonomous recovery ({recovery_attempts}/2)"
                    )

                    # 1. Research: understand the error
                    fix = await self._recovery_research(step, exec_data)
                    if not fix:
                        break

                    # 2. Apply fix
                    fix_result = await self._recovery_apply(step, fix)
                    if not fix_result:
                        break

                    # 3. Retry the original step
                    retry_step = ActionStep(
                        step_number=step.step_number,
                        description=f"[RECOVERY RETRY] {step.description}",
                        command=step.command,
                        expected_outcome=step.expected_outcome,
                    )
                    retry_result = await self._agent_action(step=retry_step)
                    retry_data = retry_result.get("result", {})

                    # 4. Re-verify
                    retry_verify = await self._agent_verification(
                        step=step,
                        result=ActionResult(**retry_data) if retry_data else ActionResult(
                            step_id=step.id, step_number=step.step_number,
                            status=StepStatus.FAILED,
                        ),
                    )
                    retry_verification = retry_verify.get("verification", {})

                    if retry_verification.get("passed"):
                        exec_data = retry_data
                        verification = retry_verification
                        passed = True
                        logger.info(
                            f"RECOVERY: Step {step.step_number} recovered "
                            f"after {recovery_attempts} attempt(s)"
                        )
                        break

            # ── End Recovery ──

            results["execution"].append({
                "step": step.step_number,
                "description": step.description,
                "status": exec_data.get("status", "failed"),
                "exit_code": exec_data.get("exit_code", -1),
                "duration_seconds": exec_data.get("duration_seconds", 0),
                "recovery_attempts": recovery_attempts,
            })

            results["verification"].append({
                "step": step.step_number,
                "passed": passed,
                "evidence": verification.get("evidence", ""),
                "suggestion": verification.get("suggestion", ""),
            })

            if mode == ExecutionMode.STEP_BY_STEP:
                break

        # Phase 4: Learn from results
        await self._learn_from_execution(execution_plan, results)

        # Phase 5: Check outcome
        success_count = sum(1 for v in results["verification"] if v.get("passed"))
        total_count = len(results["verification"])

        if total_count > 0 and success_count == total_count:
            results["outcome"] = "success"
        elif success_count > 0:
            results["outcome"] = "partial_success"
        else:
            results["outcome"] = "failed"

        goal.status = StepStatus.COMPLETED if results["outcome"] == "success" else StepStatus.FAILED
        goal.completed_at = now_utc()

        # Record in history
        self._execution_history.append({
            "goal": results["goal"],
            "outcome": results["outcome"],
            "steps_total": len(results.get("execution", [])),
            "steps_passed": success_count,
            "timestamp": now_utc().isoformat(),
        })
        # Keep last 100
        if len(self._execution_history) > 100:
            self._execution_history = self._execution_history[-100:]

        logger.info(
            f"SOLVE: Complete — {results['outcome']} "
            f"({success_count}/{total_count} steps passed)"
        )
        return results

    async def _learn_from_execution(
        self, plan: ExecutionPlan, results: dict
    ) -> None:
        """Extract lessons from execution and store in memory."""
        if not results.get("execution"):
            return

        # Build a lessons summary
        lessons = []
        for exec_entry, verify_entry in zip(
            results["execution"], results["verification"]
        ):
            if verify_entry.get("passed"):
                lessons.append(f"Step {exec_entry['step']} succeeded: {exec_entry['description']}")
            else:
                suggestion = verify_entry.get("suggestion", "")
                lessons.append(
                    f"Step {exec_entry['step']} failed: {exec_entry['description']}. "
                    f"Suggestion: {suggestion}"
                )

        lesson_text = "\n".join(lessons)
        outcome = results.get("outcome", "unknown")

        try:
            await self.engine.remember(
                content=f"Execution results for goal '{results['goal'][:100]}': "
                        f"Outcome={outcome}. Lessons:\n{lesson_text}",
                layer=MemoryLayer.WORKING,
                memory_type=MemoryType.EXPERIENCE,
                project="deepspace",
                tags=["execution", "autonomous", outcome],
                source="orchestrator-solve",
                auto_summarize=False,
                auto_embed=True,
                auto_graph=False,
            )
            logger.info("SOLVE: Lessons stored in memory")
        except Exception as e:
            logger.warning(f"SOLVE: Failed to store lessons: {e}")

    # ── Full Pipeline ──────────────────────────

    async def run_full_cycle(self) -> dict:
        """Run a complete orchestration cycle."""
        cycle_id = now_utc().isoformat()
        results = {}

        logger.info(f"Starting orchestration cycle {cycle_id}")

        # 1. Memory consolidation
        try:
            cons_result = await self.engine.consolidate()
            results["consolidation"] = cons_result.model_dump()
            results["consolidation"]["status"] = "ok"
        except Exception as e:
            results["consolidation"] = {"status": "error", "error": str(e)}

        # 2. Reflection
        try:
            results["reflection"] = await self.engine.reflect()
        except Exception as e:
            results["reflection"] = {"status": "error", "error": str(e)}

        # 3. Autonomous learning (non-blocking, one task)
        try:
            learn_result = await self.learner.check_and_learn(force=False)
            results["learning"] = {
                "status": "completed" if learn_result else "skipped",
                "task": learn_result.title if learn_result else None,
            }
        except Exception as e:
            results["learning"] = {"status": "error", "error": str(e)}

        # 4. Proactive check
        try:
            push_message = await self.proactive.push()
            results["proactive"] = {
                "pushed": push_message is not None,
                "message": push_message,
            }
        except Exception as e:
            results["proactive"] = {"status": "error", "error": str(e)}

        results["cycle_id"] = cycle_id
        logger.info(f"Orchestration cycle {cycle_id} complete")

        return results

    # ── Continuous Loop ────────────────────────

    async def run_loop(
        self,
        consolidate_interval: int = 60,
        learn_interval: int = 15,
        proactive_interval: int = 10,
    ):
        """Run the orchestrator continuously with staggered intervals."""
        self._running = True
        last_consolidation = 0.0
        last_learn = 0.0
        last_proactive = 0.0

        logger.info("Orchestrator started (Executive + Action + Verification Agents online)")

        while self._running:
            now = asyncio.get_event_loop().time()

            if now - last_consolidation >= consolidate_interval * 60:
                try:
                    await self.engine.consolidate()
                    last_consolidation = now
                    logger.debug("Consolidation cycle complete")
                except Exception as e:
                    logger.error(f"Consolidation failed: {e}")

            if now - last_learn >= learn_interval * 60:
                try:
                    await self.learner.check_and_learn(force=False)
                    last_learn = now
                except Exception as e:
                    logger.error(f"Learning cycle failed: {e}")

            if now - last_proactive >= proactive_interval * 60:
                try:
                    await self.proactive.push()
                    last_proactive = now
                except Exception as e:
                    logger.error(f"Proactive cycle failed: {e}")

            await asyncio.sleep(60)

    def stop(self):
        """Stop the orchestrator and all sub-agents."""
        self._running = False
        self.learner.stop()
        logger.info("Orchestrator stopped")

    # ── Autonomous Recovery (NEW) ──────────────

    async def _recovery_research(
        self, step: ActionStep, exec_data: dict
    ) -> Optional[str]:
        """Research why a step failed and generate a fix command."""
        stderr = exec_data.get("stderr", "")
        stdout = exec_data.get("stdout", "")

        try:
            fix = await self.llm.chat_structured(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "A command failed during autonomous execution. "
                            "Analyze the error and generate a SINGLE shell command "
                            "that will fix the issue. The fix command should be safe "
                            "and idempotent. If the problem is not fixable with a "
                            "shell command, return an empty command.\n\n"
                            "Common fixes: install missing packages, create directories, "
                            "fix permissions, update configs, restart services."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Failed command: {step.command}\n"
                            f"Exit code: {exec_data.get('exit_code', -1)}\n"
                            f"Stdout: {stdout[:500]}\n"
                            f"Stderr: {stderr[:500]}"
                        ),
                    },
                ],
                output_schema={
                    "type": "object",
                    "properties": {
                        "fix_command": {"type": "string"},
                        "explanation": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                },
            )

            fix_cmd = fix.get("fix_command", "").strip()
            if fix_cmd and fix.get("confidence", 0) >= 0.5:
                logger.info(
                    f"RECOVERY: Generated fix — {fix_cmd[:80]} "
                    f"(confidence: {fix.get('confidence', 0):.2f})"
                )
                return fix_cmd

            logger.warning(
                f"RECOVERY: No viable fix generated "
                f"(confidence: {fix.get('confidence', 0):.2f})"
            )
            return None
        except Exception as e:
            logger.error(f"RECOVERY: Research failed: {e}")
            return None

    async def _recovery_apply(
        self, step: ActionStep, fix_command: str
    ) -> bool:
        """Apply a fix command. Returns True if fix succeeded."""
        try:
            fix_step = ActionStep(
                step_number=-1,  # Special: recovery step
                description=f"Auto-fix for step {step.step_number}",
                command=fix_command,
                timeout_seconds=60,
            )
            result = await self.executor.execute_with_retry(fix_step)

            if result.status == StepStatus.COMPLETED:
                logger.info(f"RECOVERY: Fix applied successfully")
                return True

            logger.warning(
                f"RECOVERY: Fix failed (exit {result.exit_code}): {result.stderr[:100]}"
            )
            return False
        except Exception as e:
            logger.error(f"RECOVERY: Apply failed: {e}")
            return False

    # ── Self-Derived Goals (NEW) ────────────────

    async def derive_goals(self, max_goals: int = 3) -> list[dict]:
        """
        Derive actionable goals from reflection gaps and context.
        This is the core of autonomous initiative — the system finds
        its own problems to solve.
        """
        reflection = await self.engine.reflect()
        context = await self.proactive.detect_context()

        gaps = reflection.get("gaps", [])
        if not gaps:
            return []

        # Filter to high-priority gaps
        high_priority = [g for g in gaps if g.get("priority", 0) >= 0.5][:max_goals]
        if not high_priority:
            return []

        goals = []
        for gap in high_priority:
            topic = gap.get("topic", "")
            reason = gap.get("reason", "")

            goals.append({
                "description": f"Research and understand: {topic}",
                "context": f"Knowledge gap identified during reflection. Reason: {reason}",
                "source": "self-derived",
                "priority": gap.get("priority", 0.5),
                "topic": topic,
            })

        logger.info(f"DERIVE: Generated {len(goals)} self-derived goals from {len(gaps)} gaps")
        return goals

    async def solve_self_derived_goals(self, max_goals: int = 2) -> list[dict]:
        """
        Derive goals from knowledge gaps and autonomously solve them.
        This runs in the background — no user interaction needed.
        """
        goals = await self.derive_goals(max_goals=max_goals)
        results = []

        for goal_data in goals:
            logger.info(f"AUTO-SOLVE: Starting self-derived goal — {goal_data['description'][:80]}")

            try:
                result = await self.solve_goal(
                    description=goal_data["description"],
                    context=goal_data.get("context", ""),
                    mode=ExecutionMode.FULL_AUTO,
                )
                results.append({
                    "goal": goal_data["description"],
                    "outcome": result.get("outcome", "failed"),
                    "steps": len(result.get("execution", [])),
                })

                # Remember this was a self-derived goal
                await self.engine.remember(
                    content=f"Self-derived goal: {goal_data['description']}. Outcome: {result.get('outcome')}",
                    layer=MemoryLayer.WORKING,
                    memory_type=MemoryType.EXPERIENCE,
                    tags=["autonomous", "self-derived", result.get("outcome", "failed")],
                    source="orchestrator-auto-solve",
                    auto_summarize=False,
                    auto_embed=True,
                    auto_graph=False,
                )
            except Exception as e:
                logger.error(f"AUTO-SOLVE: Failed for '{goal_data['description'][:60]}': {e}")
                results.append({
                    "goal": goal_data["description"],
                    "outcome": "error",
                    "error": str(e),
                })

        return results

    @property
    def execution_history(self) -> list[dict]:
        return list(self._execution_history)