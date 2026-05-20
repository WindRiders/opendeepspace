"""
DeepSpace API Server — FastAPI with WebSocket support.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
        self.orchestrator: Optional[Orchestrator] = None
        self.llm: Optional[LLMClient] = None
        self.proactive: Optional[ProactiveService] = None
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


# Global plugin manager (shared across all Orchestrator instances)
_plugin_manager = None


def _get_plugin_handlers() -> dict:
    """Get plugin execution handlers from global plugin manager."""
    global _plugin_manager
    if _plugin_manager is None:
        from core.plugin_manager import PluginManager
        _plugin_manager = PluginManager()
        try:
            import asyncio
            asyncio.get_event_loop()
        except RuntimeError:
            pass  # No event loop yet
    if _plugin_manager.plugins:
        return _plugin_manager.get_all_execution_handlers()
    return {}


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
    # Auto-load plugins on startup
    try:
        global _plugin_manager
        from core.plugin_manager import PluginManager
        _plugin_manager = PluginManager()
        await _plugin_manager.discover()
        await _plugin_manager.load_all()
        await _plugin_manager.enable_all()
        if _plugin_manager.plugins:
            logger.info(f"Plugins auto-loaded: {len(_plugin_manager.plugins)} enabled")
    except Exception as e:
        logger.debug(f"Plugin auto-load skipped: {e}")
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
    version="0.8.1",
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


# ── Auth (NEW) ────────────────────────────────

# Optional API auth — set DEEP_SPACE_API_TOKEN to enable
API_TOKEN = os.environ.get("DEEP_SPACE_API_TOKEN", "")
_auth_enabled = bool(API_TOKEN)
security = HTTPBearer(auto_error=False)


async def verify_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Verify API token if auth is enabled."""
    if not _auth_enabled:
        return True
    if credentials and credentials.credentials == API_TOKEN:
        return True
    raise HTTPException(status_code=401, detail="Invalid or missing API token")


# ── Health ───────────────────────────────────

# ── Autonomous Execution Endpoints (NEW) ──

@app.post("/solve")
async def api_solve(request: SolveRequest, _auth=Depends(verify_auth)):
    """Execute autonomous problem-solving: Goal → Plan → Execute → Verify → Learn."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config, plugin_handlers=_get_plugin_handlers())

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
    orch = Orchestrator(engine, engine.llm, config, plugin_handlers=_get_plugin_handlers())
    return {"executions": orch.execution_history[-limit:]}


@app.post("/orchestrator/auto-solve")
async def api_auto_solve():
    """Derive and solve self-derived goals from knowledge gaps."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config, plugin_handlers=_get_plugin_handlers())
    results = await orch.solve_self_derived_goals(max_goals=2)
    return {"results": results}


@app.get("/goals")
async def api_goals():
    """Get self-derived goals from reflection gaps."""
    config = load_config()
    engine = await get_engine(config)
    orch = Orchestrator(engine, engine.llm, config, plugin_handlers=_get_plugin_handlers())
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
    return {"status": "ok", "version": "0.8.1", "agents": 9, "features": ["memory", "graph", "learn", "execute", "recover", "dashboard", "export", "dedup", "notify", "timeline", "plugins", "auth", "analytics"]}


@app.get("/analytics")
async def api_analytics(days: int = 30):
    """Get memory analytics: trends, active projects, growth."""
    config = load_config()
    engine = await get_engine(config)

    stats = await engine.stats()
    all_memories = []
    for layer in MemoryLayer:
        mems = await engine.vector_store.get_by_layer(layer, limit=500)
        all_memories.extend(mems)

    # Projects
    from collections import Counter
    project_counts = Counter(m.project for m in all_memories if m.project)
    type_counts = Counter(m.memory_type.value for m in all_memories)

    # Growth by day
    by_day = Counter()
    for m in all_memories:
        day = m.created_at.isoformat()[:10] if hasattr(m.created_at, 'isoformat') else str(m.created_at)[:10]
        by_day[day] += 1

    # Importance distribution
    importance_buckets = {"low (0-0.3)": 0, "medium (0.3-0.7)": 0, "high (0.7-1.0)": 0}
    for m in all_memories:
        if m.importance < 0.3: importance_buckets["low (0-0.3)"] += 1
        elif m.importance < 0.7: importance_buckets["medium (0.3-0.7)"] += 1
        else: importance_buckets["high (0.7-1.0)"] += 1

    return {
        "total_memories": stats["total_memories"],
        "by_layer": stats["by_layer"],
        "top_projects": project_counts.most_common(10),
        "top_types": type_counts.most_common(10),
        "growth_by_day": sorted(by_day.items())[-days:],
        "importance_distribution": importance_buckets,
        "avg_importance": round(sum(m.importance for m in all_memories) / max(len(all_memories), 1), 3),
    }


@app.get("/timeline")
async def api_timeline(days: int = 30, project: str = ""):
    """Get chronological timeline of memories and executions."""
    config = load_config()
    engine = await get_engine(config)
    from core.timeline import TimelineGenerator
    from core.orchestrator import Orchestrator
    orch = Orchestrator(engine, engine.llm, config, plugin_handlers=_get_plugin_handlers())
    gen = TimelineGenerator(engine, orchestrator=orch)
    if project:
        return await gen.get_project_timeline(project=project, days=days)
    return await gen.get_full_timeline(days=days)


@app.get("/plugins")
async def api_plugins():
    """Get plugin manager status."""
    from core.plugin_manager import PluginManager
    manager = PluginManager()
    await manager.discover()
    return manager.status


@app.get("/model-status")
async def api_model_status():
    """Get model router health and provider status."""
    from core.model_router import ModelRouter
    config = load_config()
    router = ModelRouter(config)
    return router.status


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