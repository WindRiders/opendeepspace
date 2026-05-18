"""
DeepSpace API Server — FastAPI with WebSocket support.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import MemoryLayer, MemoryType, ExecutionMode
from core.orchestrator import Orchestrator
from core.errors import DeepSpaceError
from core.proactive_service import ProactiveService
from core.notifier import get_notifier
from storage.pgvector_store import PgVectorStore, create_store
from storage.neo4j_store import Neo4jGraphStore, create_graph_store

logger = logging.getLogger("deepspace.api")


# ── Request/Response Models ──────────────────

class RememberRequest(BaseModel):
    content: str
    layer: str = "short_term"
    memory_type: Optional[str] = None
    project: str = ""
    tags: list[str] = []
    source: str = "api"


class RecallRequest(BaseModel):
    query: str
    layer: Optional[str] = None
    project: Optional[str] = None
    top_k: int = 10


class ProjectRequest(BaseModel):
    name: str
    path: str
    description: str = ""
    tech_stack: list[str] = []


class SolveRequest(BaseModel):
    goal: str
    context: str = ""
    mode: str = "semi_auto"  # plan_only | step_by_step | semi_auto | full_auto


# ── App State ────────────────────────────────

class AppState:
    def __init__(self):
        self.engine: Optional[MemoryEngine] = None
        self.proactive: Optional[ProactiveService] = None
        self.llm: Optional[LLMClient] = None
        self.ws_connections: list[WebSocket] = []  # Active WS clients

    async def broadcast(self, data: dict):
        """Broadcast to all connected WebSocket clients."""
        disconnected = []
        for ws in self.ws_connections:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            if ws in self.ws_connections:
                self.ws_connections.remove(ws)

state = AppState()


async def init_app(config: dict):
    """Initialize all components."""
    state.llm = LLMClient(config)
    state.engine = MemoryEngine(
        state.llm,
        await create_store(config),
        await create_graph_store(config),
        config,
    )
    state.orchestrator = Orchestrator(state.engine, state.llm, config)
    state.proactive = ProactiveService(state.engine, state.llm, config)
    logger.info("DeepSpace API initialized")


# ── Lifespan ─────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    import yaml, os, re
    from pathlib import Path

    config_path = Path.home() / "deepspace" / "config" / "config.yaml"
    with open(config_path) as f:
        raw = f.read()

    def expand_env(match):
        return os.environ.get(match.group(1), "")
    raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)
    config = yaml.safe_load(raw)

    # Fallback: Hermes config for API key
    if not config.get("llm", {}).get("api_key", "").startswith("sk-"):
        hermes_config = Path.home() / ".hermes" / "config.yaml"
        if hermes_config.exists():
            with open(hermes_config) as hf:
                hconfig = yaml.safe_load(hf)
            providers = hconfig.get("custom_providers", [])
            if isinstance(providers, dict):
                providers = list(providers.values())
            for p in providers:
                if isinstance(p, dict) and "dashscope" in p.get("base_url", ""):
                    config["llm"]["api_key"] = p.get("api_key", "")
                    break

    await init_app(config)
    logger.info("DeepSpace API server started")
    yield
    # Shutdown
    if state.orchestrator:
        state.orchestrator.stop()
    logger.info("DeepSpace API server stopped")


# ── FastAPI App ──────────────────────────────

app = FastAPI(
    title="DeepSpace API",
    description="Autonomous Learning Memory System",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Memory Endpoints ─────────────────────────

@app.post("/remember")
async def api_remember(req: RememberRequest):
    """Store a new memory."""
    try:
        layer = MemoryLayer(req.layer)
    except ValueError:
        return JSONResponse({"error": f"Invalid layer: {req.layer}"}, 400)

    memory = await state.engine.remember(
        content=req.content,
        layer=layer,
        memory_type=MemoryType(req.memory_type) if req.memory_type else None,
        project=req.project,
        tags=req.tags,
        source=req.source,
    )
    return {
        "id": memory.id,
        "layer": memory.layer.value,
        "type": memory.memory_type.value,
        "importance": memory.importance,
        "summary": memory.summary or memory.content[:100],
    }


@app.post("/recall")
async def api_recall(req: RecallRequest):
    """Search memories."""
    layer = MemoryLayer(req.layer) if req.layer else None
    results = await state.engine.recall(
        query=req.query,
        layer=layer,
        project=req.project,
        top_k=req.top_k,
    )
    return {
        "count": len(results),
        "results": [
            {
                "id": m.id,
                "content": m.summary or m.content[:120],
                "layer": m.layer.value,
                "type": m.memory_type.value,
                "importance": m.importance,
            }
            for m in results
        ],
    }


@app.get("/stats")
async def api_stats():
    """Get memory statistics."""
    stats = await state.engine.stats()
    return stats


@app.post("/consolidate")
async def api_consolidate():
    """Run memory consolidation."""
    result = await state.engine.consolidate()
    return result.model_dump()


@app.get("/reflect")
async def api_reflect():
    """Run meta-cognition reflection."""
    result = await state.engine.reflect()
    return result


@app.post("/project")
async def api_project(req: ProjectRequest):
    """Register a project."""
    await state.engine.set_project_context(
        name=req.name,
        path=req.path,
        description=req.description,
        tech_stack=req.tech_stack,
    )
    return {"status": "ok", "project": req.name}


@app.get("/projects")
async def api_projects():
    """List registered projects."""
    projects = await state.engine.get_active_projects()
    return {
        "count": len(projects),
        "projects": [
            {"name": p.name, "path": p.path, "description": p.description}
            for p in projects
        ],
    }


# ── Graph Endpoints ──────────────────────────

@app.get("/graph/search")
async def api_graph_search(q: str, type: Optional[str] = None, top_k: int = 10):
    """Search knowledge graph."""
    from core.models import EntityType
    entity_type = EntityType(type) if type else None
    entities = await state.engine.graph_store.search_entities(q, entity_type, top_k)
    return {
        "count": len(entities),
        "entities": [
            {"name": e.name, "type": e.entity_type.value, "description": e.description}
            for e in entities
        ],
    }


@app.get("/graph/neighbors/{entity_name}")
async def api_graph_neighbors(entity_name: str):
    """Get entity neighbors."""
    entities = await state.engine.graph_store.search_entities(entity_name, top_k=1)
    if not entities:
        return {"error": "Entity not found"}
    
    neighbors = await state.engine.graph_store.get_neighbors(entities[0].id)
    return {
        "entity": entities[0].name,
        "neighbors": [
            {
                "name": n.name,
                "type": n.entity_type.value,
                "relation": r.relation_type.value,
                "confidence": r.confidence,
            }
            for n, r in neighbors
        ],
    }


# ── Orchestrator Endpoints ───────────────────

@app.post("/orchestrator/cycle")
async def api_orchestrator_cycle():
    """Run a full orchestration cycle."""
    result = await state.orchestrator.run_full_cycle()
    return result


@app.get("/orchestrator/status")
async def api_orchestrator_status():
    """Get orchestrator status."""
    return {
        "running": state.orchestrator._running,
        "learner": await state.orchestrator.learner.status(),
    }


# ── Proactive Endpoints ──────────────────────

@app.get("/proactive/context")
async def api_context():
    """Get current user context."""
    context = await state.proactive.detect_context()
    return context


@app.get("/proactive/predict")
async def api_predict():
    """Get predictions for user needs."""
    predictions = await state.proactive.predict_needs()
    return {"predictions": predictions}


@app.get("/proactive/push")
async def api_push():
    """Trigger a proactive push."""
    message = await state.proactive.push()
    return {"pushed": message is not None, "message": message}


@app.get("/proactive/briefing")
async def api_briefing():
    """Get daily briefing."""
    briefing = await state.proactive.daily_briefing()
    return {"briefing": briefing}


# ── WebSocket ────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time DeepSpace updates."""
    await websocket.accept()
    state.ws_connections.append(websocket)
    logger.info(f"WebSocket client connected ({len(state.ws_connections)} active)")

    try:
        # Send initial stats
        stats = await state.engine.stats()
        await websocket.send_json({"type": "stats", "data": stats})

        while True:
            # Wait for client messages (commands)
            data = await websocket.receive_json()
            cmd = data.get("command", "")

            if cmd == "context":
                ctx = await state.proactive.detect_context()
                await websocket.send_json({"type": "context", "data": ctx})

            elif cmd == "predict":
                preds = await state.proactive.predict_needs()
                await websocket.send_json({"type": "predictions", "data": preds})

            elif cmd == "push":
                msg = await state.proactive.push()
                if msg:
                    await websocket.send_json({"type": "push", "message": msg})
                    # Desktop notification
                    get_notifier().notify("DeepSpace", msg, subtitle="Proactive Push")
                else:
                    await websocket.send_json({"type": "push", "message": None})

            elif cmd == "remember":
                memory = await state.engine.remember(
                    content=data.get("content", ""),
                    layer=MemoryLayer(data.get("layer", "short_term")),
                    source="websocket",
                )
                await websocket.send_json({"type": "remembered", "id": memory.id})

            elif cmd == "recall":
                results = await state.engine.recall(
                    query=data.get("query", ""),
                    top_k=data.get("top_k", 5),
                )
                await websocket.send_json({
                    "type": "recall",
                    "results": [
                        {"id": m.id, "content": m.summary or m.content[:100]}
                        for m in results
                    ],
                })

            elif cmd == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown command: {cmd}"})

    except WebSocketDisconnect:
        if websocket in state.ws_connections:
            state.ws_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected ({len(state.ws_connections)} active)")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


# ── Health ───────────────────────────────────

# ── Autonomous Execution Endpoints (NEW) ──

@app.post("/solve")
async def api_solve(request: SolveRequest):
    """Execute autonomous problem-solving: Goal → Plan → Execute → Verify → Learn."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config)

    mode = ExecutionMode(request.mode) if request.mode else ExecutionMode.SEMI_AUTO

    result = await orch.solve_goal(
        description=request.goal,
        context=request.context,
        mode=mode,
    )
    # Broadcast update to dashboard
    await state.broadcast({
        "type": "orchestrator_update",
        "goal": request.goal[:100],
        "outcome": result.get("outcome"),
        "steps": len(result.get("execution", [])),
    })
    return result


@app.get("/executions")
async def api_executions(limit: int = 20):
    """Get execution history."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config)
    return {"executions": orch.execution_history[-limit:]}


@app.post("/orchestrator/auto-solve")
async def api_auto_solve():
    """Derive and solve self-derived goals from knowledge gaps."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config)
    results = await orch.solve_self_derived_goals(max_goals=2)
    return {"results": results}


@app.get("/goals")
async def api_goals():
    """Get self-derived goals from reflection gaps."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config)
    goals = await orch.derive_goals(max_goals=5)
    return {"goals": goals}


# ── Error Handler (NEW) ───────────────────────

@app.exception_handler(DeepSpaceError)
async def deepspace_error_handler(request, exc: DeepSpaceError):
    return JSONResponse(
        status_code=500,
        content=exc.to_dict(),
    )


@app.exception_handler(Exception)
async def general_error_handler(request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": True, "code": "INTERNAL_ERROR", "message": str(exc)},
    )


# ── Dashboard (NEW) ───────────────────────────

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard():
    """Serve the web dashboard UI."""
    import os as _os
    path = _os.path.join(_os.path.dirname(__file__), "..", "templates", "dashboard.html")
    if _os.path.exists(path):
        with open(path) as f:
            return f.read()
    return "<h1>Dashboard template not found</h1>"


@app.post("/dedup")
async def api_dedup(threshold: float = 0.85, dry_run: bool = False):
    """Find and merge semantically duplicate memories."""
    config = load_config()
    engine = await get_engine(config)
    result = await engine.deduplicate(threshold=threshold, dry_run=dry_run)
    return result


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.5.0", "agents": 9, "features": ["memory", "graph", "learn", "execute", "recover", "dashboard", "export", "dedup", "notify"]}


# ── Main ─────────────────────────────────────

def main():
    import uvicorn
    uvicorn.run(
        "api.server:app",
        host="127.0.0.1",
        port=8645,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()