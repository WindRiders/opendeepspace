"""
DeepSpace gRPC Server — exposes AgentEngine service.

Run standalone:
    python -m api.grpc_server

Or import and call serve() from another entry point.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from concurrent import futures
from pathlib import Path
from typing import Optional

import grpc

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# gRPC generated code (must run proto/generate.sh first)
try:
    from api import agent_pb2
    from api import agent_pb2_grpc
except ImportError:
    # Fallback: try relative import
    import agent_pb2
    import agent_pb2_grpc

from core.models import MemoryLayer

# Engine imports done lazily in serve() to tolerate missing database drivers.
# Type annotations use strings (from __future__ import annotations), so they're safe.

logger = logging.getLogger("deepspace.grpc")


class AgentEngineServicer(agent_pb2_grpc.AgentEngineServicer):
    """gRPC implementation wrapping the core engine."""

    def __init__(self, engine: MemoryEngine, orchestrator: Orchestrator, router: ModelRouter, llm: LLMClient, config: dict):
        self.engine = engine
        self.orchestrator = orchestrator
        self.router = router
        self.llm = llm
        self.config = config
        self._start_time = time.time()

    # ─── Agent Interaction ──────────────────────────────────────

    async def Interact(self, request, context):
        """Single-turn agent interaction with tool calling."""
        dna = request.dna or "You are a helpful AI agent."
        message = request.message
        session_id = request.session_id or os.urandom(8).hex()
        model_id = request.model_id or self.config.get("llm", {}).get("models", {}).get("primary", "qwen-plus")

        try:
            system_msg = (
                f"You are a DeepSpace autonomous agent.\n"
                f"DNA/Role: {dna}\n\n"
                f"You have access to shell, file, and code execution tools. "
                f"Use tools when needed, respond directly when you can."
            )
            messages = [{"role": "system", "content": system_msg}, {"role": "user", "content": message}]
            tool_calls_log = []
            reply = ""
            total_steps = 0
            max_steps = 5

            for i in range(max_steps):
                response = await self.llm.chat_complete(
                    messages=messages,
                    model=model_id,
                    temperature=0.7,
                )
                total_steps = i + 1
                choice = response.choices[0]
                msg = choice.message

                if msg.tool_calls:
                    from core.orchestrator import ActionStep
                    messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                        {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in msg.tool_calls
                    ]})

                    for tc in msg.tool_calls:
                        tool_name = tc.function.name
                        try:
                            args_dict = json.loads(tc.function.arguments)
                        except json.JSONDecodeError:
                            args_dict = {}

                        step = ActionStep(
                            index=i, description=tool_name,
                            command=json.dumps(args_dict), action_type="shell",
                        )
                        result = await self.orchestrator.agent_action(step)
                        result_str = result.get("stdout", "") or result.get("stderr", "") or "(empty)"

                        tool_calls_log.append(agent_pb2.ToolCall(
                            name=tool_name,
                            args_json=tc.function.arguments,
                            result=result_str[:500],
                            step=i + 1,
                        ))
                        messages.append({"role": "tool", "content": result_str[:500], "tool_call_id": tc.id})
                else:
                    reply = msg.content or ""
                    break

            if not reply:
                reply = "Agent 已达到最大执行步数。"

            try:
                await self.engine.remember(
                    content=f"User: {message}\nAgent: {reply}",
                    layer=MemoryLayer.SHORT_TERM,
                    memory_type="conversation",
                    source="grpc",
                    importance=0.5,
                )
            except Exception:
                pass

            return agent_pb2.InteractResponse(
                reply=reply, tool_calls=tool_calls_log,
                total_steps=total_steps, session_id=session_id,
            )

        except Exception as e:
            logger.exception("Interact error")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.InteractResponse(reply=f"Error: {e}", session_id=session_id)

    async def InteractStream(self, request, context):
        """Streaming agent interaction — real LLM streaming with tool calling."""
        dna = request.dna or "You are a helpful AI agent."
        message = request.message
        session_id = request.session_id or os.urandom(8).hex()
        user_id = request.user_id or "default"
        model_id = request.model_id or self.config.get("llm", {}).get("models", {}).get("primary", "qwen-plus")

        try:
            system_msg = f"You are a DeepSpace autonomous agent.\nDNA/Role: {dna}\n\nYou have access to shell, file, and code execution tools."
            messages = [{"role": "system", "content": system_msg}, {"role": "user", "content": message}]
            total_steps = 0
            max_steps = 5

            for i in range(max_steps):
                yield agent_pb2.InteractStreamChunk(
                    type="thinking",
                    content=f"Step {i + 1}: reasoning...",
                    step=i + 1,
                )

                # Collect streaming chunks
                full_content = ""
                tool_call_buf: dict[str, dict] = {}
                async for chunk in self.llm.chat_stream(messages=messages, model=model_id, temperature=0.7):
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if not delta:
                        continue
                    if delta.content:
                        full_content += delta.content
                        yield agent_pb2.InteractStreamChunk(
                            type="text_chunk", content=delta.content, step=i + 1,
                        )
                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_call_buf:
                                tool_call_buf[idx] = {"id": tc.id or "", "name": "", "arguments": ""}
                            if tc.id:
                                tool_call_buf[idx]["id"] = tc.id
                            if tc.function:
                                if tc.function.name:
                                    tool_call_buf[idx]["name"] += tc.function.name
                                if tc.function.arguments:
                                    tool_call_buf[idx]["arguments"] += tc.function.arguments

                total_steps = i + 1

                if tool_call_buf:
                    ordered = [tool_call_buf[k] for k in sorted(tool_call_buf.keys())]
                    from core.orchestrator import ActionStep

                    for tc_data in ordered:
                        tool_name = tc_data["name"]
                        tool_args = tc_data["arguments"]

                        yield agent_pb2.InteractStreamChunk(
                            type="tool_call_start", tool_name=tool_name,
                            args_json=tool_args, step=i + 1,
                        )

                        try:
                            args_dict = json.loads(tool_args) if tool_args else {}
                        except json.JSONDecodeError:
                            args_dict = {}

                        start = time.time()
                        step_obj = ActionStep(index=i, description=tool_name, command=json.dumps(args_dict), action_type="shell")
                        result = await self.orchestrator.agent_action(step_obj)
                        result_str = result.get("stdout", "") or result.get("stderr", "") or "(empty)"
                        duration = int((time.time() - start) * 1000)

                        yield agent_pb2.InteractStreamChunk(
                            type="tool_call_result", tool_name=tool_name,
                            result=result_str[:500], step=i + 1, duration_ms=duration,
                        )

                        messages.append({"role": "assistant", "content": full_content or None, "tool_calls": [{
                            "id": tc_data["id"], "type": "function",
                            "function": {"name": tool_name, "arguments": tool_args},
                        }]})
                        messages.append({"role": "tool", "content": result_str[:500], "tool_call_id": tc_data["id"]})
                else:
                    break

            yield agent_pb2.InteractStreamChunk(
                type="done", total_steps=total_steps, session_id=session_id,
            )

        except Exception as e:
            logger.exception("InteractStream error")
            yield agent_pb2.InteractStreamChunk(
                type="error", code="AGENT_ERROR", message=str(e), session_id=session_id,
            )

    # ─── Memory ───────────────────────────────────────────────

    async def Remember(self, request, context):
        try:
            memory = await self.engine.remember(
                content=request.content,
                layer=getattr(MemoryLayer, request.layer, MemoryLayer.SHORT_TERM) if request.layer else MemoryLayer.SHORT_TERM,
                memory_type=request.memory_type or "",
                project=request.project or "",
                tags=list(request.tags) if request.tags else None,
                source=request.source or "grpc",
            )
            return agent_pb2.RememberResponse(memory_id=memory.id if hasattr(memory, 'id') else str(memory))
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.RememberResponse()

    async def Recall(self, request, context):
        try:
            layer = getattr(MemoryLayer, request.layer, None) if request.layer else None
            memories = await self.engine.recall(
                query=request.query,
                layer=layer,
                memory_type=request.memory_type or None,
                project=request.project or None,
                tags=list(request.tags) if request.tags else None,
                top_k=request.top_k or 10,
                min_importance=request.min_importance or 0.0,
            )
            pb_memories = []
            for m in memories:
                pb_memories.append(agent_pb2.Memory(
                    id=getattr(m, 'id', ''),
                    content=getattr(m, 'content', '')[:1000],
                    summary=getattr(m, 'summary', '') or '',
                    layer=str(getattr(m, 'layer', '')),
                    memory_type=getattr(m, 'memory_type', '') or '',
                    importance=getattr(m, 'importance', 0.0) or 0.0,
                    project=getattr(m, 'project', '') or '',
                    tags=list(getattr(m, 'tags', []) or []),
                    source=getattr(m, 'source', '') or '',
                ))
            return agent_pb2.RecallResponse(memories=pb_memories)
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.RecallResponse()

    async def Consolidate(self, request, context):
        try:
            result = await self.engine.consolidate()
            return agent_pb2.ConsolidateResponse(
                promoted_count=getattr(result, 'promoted_count', 0),
                cleaned_count=getattr(result, 'cleaned_count', 0),
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.ConsolidateResponse()

    # ─── Orchestration ────────────────────────────────────────

    async def Solve(self, request, context):
        try:
            result = await self.orchestrator.solve_goal(
                description=request.goal,
                context=request.context or "",
                mode=request.mode or "semi_auto",
            )
            plan = []
            for step in result.get("plan", []):
                plan.append(agent_pb2.ActionStep(
                    index=step.get("index", 0),
                    description=step.get("description", ""),
                    command=step.get("command", ""),
                    action_type=step.get("action_type", "shell"),
                ))
            return agent_pb2.SolveResponse(
                goal_id=result.get("goal_id", ""),
                outcome=result.get("outcome", "unknown"),
                steps_total=result.get("steps_total", 0),
                steps_passed=result.get("steps_passed", 0),
                plan=plan,
                summary=result.get("summary", ""),
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.SolveResponse(outcome="failed", summary=str(e))

    async def SolveStream(self, request, context):
        """Stream orchestration progress using real-time on_progress callback."""
        queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(event: dict):
            await queue.put(event)

        async def run_solve():
            try:
                result = await self.orchestrator.solve_goal(
                    description=request.goal,
                    context=request.context or "",
                    mode=request.mode or "semi_auto",
                    on_progress=on_progress,
                )
                await queue.put({"type": "_done", "result": result})
            except Exception as e:
                await queue.put({"type": "_error", "message": str(e)})

        task = asyncio.create_task(run_solve())

        try:
            while True:
                event = await queue.get()
                etype = event.get("type", "")

                if etype == "_done":
                    result = event.get("result", {})
                    yield agent_pb2.SolveStreamChunk(
                        type="done", content=result.get("outcome", ""),
                    )
                    return

                if etype == "_error":
                    yield agent_pb2.SolveStreamChunk(
                        type="done", content=f"Error: {event.get('message', '')}",
                    )
                    return

                yield agent_pb2.SolveStreamChunk(
                    type=etype,
                    content=event.get("content", ""),
                    step_index=event.get("step_index", 0),
                    step_status=event.get("step_status", ""),
                    agent_role=event.get("agent_role", ""),
                )
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except Exception:
                    pass

    # ─── Autonomous ────────────────────────────────────────────

    async def GetAutonomousStatus(self, request, context):
        try:
            learner = self.orchestrator.learner if hasattr(self.orchestrator, 'learner') else None
            if not learner:
                return agent_pb2.AutonomousStatusResponse(is_idle=True)

            is_idle = learner.is_idle() if hasattr(learner, 'is_idle') else True
            pending = []
            active = None

            if hasattr(learner, '_pending_tasks'):
                for t in learner._pending_tasks:
                    pending.append(agent_pb2.LearningTask(
                        id=getattr(t, 'id', ''), topic=getattr(t, 'topic', ''),
                        priority=getattr(t, 'priority', 0.0),
                        status=getattr(t, 'status', 'pending'),
                    ))
            if hasattr(learner, '_active_task') and learner._active_task:
                t = learner._active_task
                active = agent_pb2.LearningTask(
                    id=getattr(t, 'id', ''), topic=getattr(t, 'topic', ''),
                    priority=getattr(t, 'priority', 0.0),
                    status=getattr(t, 'status', 'pending'),
                )

            return agent_pb2.AutonomousStatusResponse(
                is_idle=is_idle, pending_tasks=pending, active_task=active,
                daily_cost=learner._daily_cost if hasattr(learner, '_daily_cost') else 0.0,
                daily_budget=learner.daily_cost_budget if hasattr(learner, 'daily_cost_budget') else 1.0,
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.AutonomousStatusResponse()

    async def GetProactiveContext(self, request, context):
        try:
            proactive = self.orchestrator.proactive if hasattr(self.orchestrator, 'proactive') else None
            if not proactive:
                return agent_pb2.ProactiveContextResponse(focus="No proactive service available")

            ctx = proactive.detect_context() if hasattr(proactive, 'detect_context') else {}
            predictions = proactive.predict_needs() if hasattr(proactive, 'predict_needs') else []

            pb_preds = []
            for p in (predictions or [])[:5]:
                pb_preds.append(agent_pb2.Prediction(
                    topic=p.get("topic", ""),
                    priority=p.get("priority", 0.0) or 0.0,
                    relevance=p.get("relevance", 0.0) or 0.0,
                ))

            return agent_pb2.ProactiveContextResponse(
                focus=ctx.get("focus", ""),
                topics=list(ctx.get("topics", []) or []),
                activity_pattern=ctx.get("activity_pattern", ""),
                predictions=pb_preds,
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.ProactiveContextResponse()

    # ─── Model Router ──────────────────────────────────────────

    async def GetModelStatus(self, request, context):
        try:
            status = self.router.status
            providers = []
            for p in (status.get("providers", []) or []):
                providers.append(agent_pb2.ProviderStatus(
                    name=p.get("name", ""), healthy=p.get("healthy", False),
                    failure_rate=p.get("failure_rate", 0.0) or 0.0,
                    total_calls=p.get("total_calls", 0) or 0,
                    consecutive_failures=p.get("consecutive_failures", 0) or 0,
                ))
            return agent_pb2.ModelStatusResponse(providers=providers)
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.ModelStatusResponse()

    # ─── Knowledge Graph ───────────────────────────────────────

    async def SearchGraph(self, request, context):
        try:
            entities = await self.engine.graph_store.search_entities(
                query=request.query,
                entity_type=request.entity_type or None,
                top_k=request.top_k or 10,
            ) if hasattr(self.engine, 'graph_store') and self.engine.graph_store is not None else []
            pb_entities = []
            for e in (entities or []):
                pb_entities.append(agent_pb2.Entity(
                    id=getattr(e, 'id', ''),
                    name=getattr(e, 'name', ''),
                    type=getattr(e, 'type', '') or '',
                    description=getattr(e, 'description', '') or '',
                    confidence=getattr(e, 'confidence', 0.0) or 0.0,
                ))
            return agent_pb2.GraphSearchResponse(entities=pb_entities)
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.GraphSearchResponse()

    async def GetNeighbors(self, request, context):
        try:
            neighbors = await self.engine.graph_store.get_neighbors(
                entity_id=request.entity_name, depth=request.depth or 1,
            ) if hasattr(self.engine, 'graph_store') and self.engine.graph_store is not None else []
            pb_neighbors = []
            for entity, relation in (neighbors or []):
                pb_neighbors.append(agent_pb2.NeighborRelation(
                    entity=agent_pb2.Entity(
                        id=getattr(entity, 'id', ''),
                        name=getattr(entity, 'name', ''),
                        type=getattr(entity, 'type', '') or '',
                        description=getattr(entity, 'description', '') or '',
                    ),
                    relation_type=getattr(relation, 'type', '') or '',
                    confidence=getattr(relation, 'confidence', 0.0) or 0.0,
                ))
            return agent_pb2.NeighborsResponse(neighbors=pb_neighbors)
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.NeighborsResponse()

    # ─── Health ───────────────────────────────────────────────

    async def Health(self, request, context):
        return agent_pb2.HealthResponse(
            status="ok",
            version=self.config.get("version", "0.8.1"),
            uptime_seconds=int(time.time() - self._start_time),
        )


async def serve(config: Optional[dict] = None):
    """Start the gRPC server."""
    if config is None:
        # Load config from yaml
        try:
            import yaml
            config_path = os.path.expanduser("~/deepspace/config/config.yaml")
            if not os.path.exists(config_path):
                config_path = os.path.join(os.path.dirname(__file__), "..", "config", "config.yaml")
            if not os.path.exists(config_path):
                config_path = "/app/config/config.yaml"  # Docker path
            with open(config_path) as f:
                raw = f.read()
            # Expand env vars
            import re
            def expand(m):
                return os.environ.get(m.group(1), "")
            raw = re.sub(r'\$\{(\w+)\}', expand, raw)
            config = yaml.safe_load(raw)
        except Exception:
            config = {}

    # Override storage config from env vars (Docker service names)
    if config:
        storage = config.setdefault("storage", {})
        postgres = storage.setdefault("postgres", {})
        for key, env in [("host", "PG_HOST"), ("port", "PG_PORT"), ("user", "PG_USER"),
                          ("password", "PG_PASSWORD"), ("database", "PG_DATABASE")]:
            if os.environ.get(env):
                postgres[key] = os.environ[env] if key != "port" else int(os.environ[env])
        neo4j_cfg = storage.setdefault("neo4j", {})
        for key, env in [("uri", "NEO4J_URI"), ("user", "NEO4J_USER"), ("password", "NEO4J_PASSWORD")]:
            if os.environ.get(env):
                neo4j_cfg[key] = os.environ[env]

    # Lazy imports — tolerate missing database drivers
    from core.memory_engine import MemoryEngine, MemoryLayer
    from core.orchestrator import Orchestrator
    from core.model_router import ModelRouter
    from core.llm_client import LLMClient
    from storage.pgvector_store import create_store as create_pg_store
    from storage.neo4j_store import create_graph_store as create_neo4j_store

    logger.info("Initializing engine components...")

    # Create model router (needed by LLMClient for failover)
    router = ModelRouter(config)

    # Create LLM client with router for failover support
    llm = LLMClient(config, router=router)

    # Try to connect to databases
    pg_store = None
    graph_store = None

    try:
        pg_store = await create_pg_store(config)
        logger.info("PostgreSQL connected")
    except Exception as e:
        logger.warning(f"PostgreSQL unavailable: {e} — memory persistence disabled")

    try:
        graph_store = await create_neo4j_store(config)
        logger.info("Neo4j connected")
    except Exception as e:
        logger.warning(f"Neo4j unavailable: {e} — knowledge graph disabled")

    # Create engine with fallbacks
    engine = MemoryEngine(
        llm=llm,
        vector_store=pg_store,
        graph_store=graph_store,
        config=config,
    )

    # Create orchestrator
    orchestrator = Orchestrator(
        engine=engine,
        llm=llm,
        config=config,
    )

    # Start background loops
    asyncio.create_task(router.start_health_checks())

    # Build gRPC server
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    servicer = AgentEngineServicer(engine, orchestrator, router, llm, config)
    agent_pb2_grpc.add_AgentEngineServicer_to_server(servicer, server)

    port = int(os.environ.get("GRPC_PORT", "50051"))
    server.add_insecure_port(f"[::]:{port}")
    logger.info(f"gRPC server listening on port {port}")
    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(serve())