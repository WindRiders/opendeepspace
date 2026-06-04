"""
DeepSpace API Server — FastAPI with WebSocket support.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import socketio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
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

# Socket.IO server for collab
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
_collab_online: dict[str, set[str]] = {}  # session_id -> set of sids


@sio.event(namespace="/collab")
async def connect(sid, environ, auth):
    logger.info(f"Collab Socket.IO client connected: {sid}")


@sio.event(namespace="/collab")
async def disconnect(sid):
    logger.info(f"Collab Socket.IO client disconnected: {sid}")
    for sids in _collab_online.values():
        sids.discard(sid)


@sio.on("join-session", namespace="/collab")
async def on_join_session(sid, data):
    session_id = data.get("sessionId", "")
    if session_id not in _collab_online:
        _collab_online[session_id] = set()
    _collab_online[session_id].add(sid)
    await sio.emit("online-users", {"sessionId": session_id, "count": len(_collab_online[session_id])}, namespace="/collab")

    session = _collab_sessions.get(session_id)
    if session:
        await sio.emit("session-state", session, to=sid, namespace="/collab")


@sio.on("leave-session", namespace="/collab")
async def on_leave_session(sid, data):
    session_id = data.get("sessionId", "")
    sids = _collab_online.get(session_id, set())
    sids.discard(sid)
    await sio.emit("online-users", {"sessionId": session_id, "count": len(sids)}, namespace="/collab")


@sio.on("send-message", namespace="/collab")
async def on_send_message(sid, data):
    global _collab_msg_id
    import time
    session_id = data.get("sessionId", "")
    _collab_msg_id += 1
    msg = {
        "id": str(_collab_msg_id),
        "from": data.get("from", ""),
        "to": data.get("to", ""),
        "content": data.get("content", ""),
        "type": data.get("type", "response"),
        "timestamp": int(time.time() * 1000),
    }
    session = _collab_sessions.get(session_id)
    if session:
        session["messages"].append(msg)
    await sio.emit("agent-message", msg, namespace="/collab")


@sio.on("typing", namespace="/collab")
async def on_typing(sid, data):
    session_id = data.get("sessionId", "")
    agent = data.get("agent", "")
    await sio.emit("agent-typing", {"sessionId": session_id, "agent": agent}, namespace="/collab", skip_sid=sid)


@sio.on("execute-session", namespace="/collab")
async def on_execute_session(sid, data):
    session_id = data.get("sessionId", "")
    session = _collab_sessions.get(session_id)
    if not session:
        await sio.emit("collab-error", {"type": "collab_error", "sessionId": session_id, "message": "Session not found"}, to=sid, namespace="/collab")
        return

    session["status"] = "executing"
    await sio.emit("session-updated", {"sessionId": session_id, "status": "executing"}, namespace="/collab")

    agents = session.get("agents", [])
    total = len(agents)
    for i, role in enumerate(agents):
        role_info = next((r for r in AGENT_ROLES if r["role"] == role), None)
        name = role_info["name"] if role_info else role
        await sio.emit("collab-agent-start", {"type": "collab_agent_start", "sessionId": session_id, "agentRole": role, "agentName": name}, namespace="/collab")

        # Use LLM to generate agent response
        try:
            if state.llm:
                prompt = f"你是DeepSpace协作网络中的{name}({role})。\n任务: {session['task']}\n历史消息: {len(session['messages'])}条\n请用中文回复，给出你的专业分析和建议。"
                messages = [{"role": "system", "content": prompt}, {"role": "user", "content": f"针对任务「{session['task']}」，请给出你的分析。"}]
                full = ""
                async for chunk in state.llm.chat_stream(messages):
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta.content:
                        full += delta.content
                        await sio.emit("collab-agent-chunk", {"type": "collab_agent_chunk", "sessionId": session_id, "agentRole": role, "content": delta.content}, namespace="/collab")
                await sio.emit("collab-agent-done", {"type": "collab_agent_done", "sessionId": session_id, "agentRole": role, "fullContent": full}, namespace="/collab")
            else:
                await sio.emit("collab-agent-done", {"type": "collab_agent_done", "sessionId": session_id, "agentRole": role, "fullContent": f"[{name}] 引擎未初始化，无法生成回复。"}, namespace="/collab")
        except Exception as e:
            await sio.emit("collab-error", {"type": "collab_error", "sessionId": session_id, "message": str(e)}, namespace="/collab")

    session["status"] = "complete"
    await sio.emit("session-updated", {"sessionId": session_id, "status": "complete"}, namespace="/collab")
    await sio.emit("collab-done", {"type": "collab_done", "sessionId": session_id, "summary": f"协作完成，{total}个Agent参与。"}, namespace="/collab")


# ── Global plugin manager ─────────────────────
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
    if not config_path.exists():
        config_path = Path("/app/config/config.yaml")  # Docker path
    with open(config_path) as f:
        raw = f.read()

    def expand_env(match):
        return os.environ.get(match.group(1), "")
    raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)
    config = yaml.safe_load(raw)

    # Override storage config from env vars (Docker service names)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Memory Endpoints ─────────────────────────

# Frontend path aliases
@app.post("/memory/recall")
async def api_memory_recall(req: RecallRequest):
    """Alias for /recall — frontend compatibility."""
    return await api_recall(req)

@app.get("/memory/model-status")
async def api_memory_model_status():
    """Alias for /model-status — frontend compatibility."""
    return await api_model_status()

@app.get("/memory/autonomous-status")
async def api_memory_autonomous_status():
    """Autonomous learner status for frontend."""
    orch = state.orchestrator
    learner = getattr(orch, 'learner', None) if orch else None
    if learner:
        status = await learner.status()
        return {
            "isIdle": not status["running"],
            "pendingTasks": [
                {"id": t.id, "topic": t.title, "priority": t.priority, "status": t.status.value}
                for t in (learner.pending_tasks or [])
            ],
            "activeTask": None,
            "dailyCost": status["daily_cost"],
            "dailyBudget": status["daily_budget"],
        }
    return {"isIdle": True, "pendingTasks": [], "activeTask": None, "dailyCost": 0, "dailyBudget": 1}

# Auth bypass — Python API is open by default
@app.get("/auth/me")
async def api_auth_me():
    """Return current user profile — bypass auth."""
    return {"id": "local", "email": "dev@deepspace.local", "username": "dev", "avatarUrl": None, "role": "admin", "createdAt": "2024-01-01T00:00:00Z", "lastLoginAt": None}

@app.post("/auth/login")
@app.post("/auth/register")
async def api_auth_bypass():
    """Bypass auth — Python API doesn't require authentication."""
    return {"user": {"id": "local", "email": "dev@deepspace.local"}, "access_token": "dev-bypass-token"}

@app.get("/agent/status")
async def api_agent_status():
    """Agent status for frontend compatibility."""
    models = [
        {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "isDefault": True},
        {"id": "qwen3.6-flash", "name": "Qwen 3.6 Flash", "isDefault": False},
    ]
    return {"status": "ok", "sessionCount": 0, "models": models}

@app.post("/agent/interact/stream")
async def api_agent_interact_stream(request: Request):
    """SSE streaming chat endpoint for frontend."""
    from starlette.responses import StreamingResponse
    import json as _json

    body = await request.json()
    message = body.get("message", "")
    dna = body.get("dna", "")

    async def event_stream():
        step = 0
        try:
            yield f"data: {_json.dumps({'type': 'session_start', 'content': '会话已建立'})}\n\n"

            system_msg = dna or "你是 DeepSpace 网络中一个富有创造力的智能实体。请用中文回复。"
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": message},
            ]

            # Check if orchestrator should be used for tool-calling tasks
            task_keywords = ["执行", "运行", "分析", "查找", "搜索", "创建", "部署", "run", "execute", "deploy", "search", "analyze"]
            use_orchestrator = state.orchestrator and any(kw in message.lower() for kw in task_keywords)

            if use_orchestrator:
                yield f"data: {_json.dumps({'type': 'thinking', 'content': '正在分析任务并制定执行计划...'})}\n\n"

                try:
                    result = await state.orchestrator.solve_goal(
                        description=message,
                        context=system_msg,
                        mode=ExecutionMode.SEMI_AUTO,
                    )
                    plan = result.get("plan", [])
                    execution = result.get("execution", [])

                    for i, action in enumerate(execution):
                        step = i + 1
                        tool_name = action.get("command", action.get("tool", "execute"))[:50]
                        yield f"data: {_json.dumps({'type': 'tool_call_start', 'step': step, 'toolName': tool_name, 'args': action})}\n\n"

                        # Simulate tool execution (actual execution already happened in solve_goal)
                        r = action.get("result", "")
                        if isinstance(r, dict):
                            r = r.get("output", r.get("stdout", str(r)))
                        yield f"data: {_json.dumps({'type': 'tool_call_result', 'step': step, 'toolName': tool_name, 'result': str(r)[:500], 'durationMs': int(action.get('duration', 0) * 1000)})}\n\n"

                    # Stream the final output
                    outcome = result.get("outcome", "任务完成")
                    verdict = result.get("verdict", outcome)
                    for char in str(verdict):
                        yield f"data: {_json.dumps({'type': 'text_chunk', 'content': char})}\n\n"

                    yield f"data: {_json.dumps({'type': 'done', 'totalSteps': max(step, 1), 'sessionId': ''})}\n\n"
                except Exception as e:
                    logger.error(f"Orchestrator SSE error: {e}")
                    yield f"data: {_json.dumps({'type': 'error', 'code': 'ORCHESTRATOR_ERROR', 'message': str(e)})}\n\n"
            else:
                yield f"data: {_json.dumps({'type': 'thinking', 'content': '正在思考...'})}\n\n"

                full_text = ""
                async for chunk in state.llm.chat_stream(messages):
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta.content:
                        full_text += delta.content
                        yield f"data: {_json.dumps({'type': 'text_chunk', 'content': delta.content})}\n\n"

                yield f"data: {_json.dumps({'type': 'done', 'totalSteps': 1})}\n\n"

        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield f"data: {_json.dumps({'type': 'error', 'code': 'STREAM_ERROR', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.delete("/agent/session/{session_id}")
async def api_agent_session_delete(session_id: str):
    """Delete agent session — frontend compatibility."""
    return {"deleted": session_id}

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
        "memories": [
            {
                "id": m.id,
                "content": m.summary or m.content[:120],
                "summary": m.summary or m.content[:120],
                "layer": m.layer.value,
                "memoryType": m.memory_type.value,
                "importance": m.importance,
                "project": getattr(m, "project", ""),
                "tags": getattr(m, "tags", []),
                "source": getattr(m, "source", "api"),
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


# ── Sandbox Endpoints ────────────────────────

@app.get("/sandbox/files")
async def api_sandbox_files(path: str = ""):
    """List sandbox files and directories."""
    import os as _os
    from pathlib import Path

    workdir = _os.environ.get("DEEP_SPACE_WORKDIR", str(Path.home() / "deepspace" / "workspace"))
    target = _os.path.join(workdir, path) if path else workdir
    target = _os.path.realpath(target)

    if not target.startswith(_os.path.realpath(workdir)):
        raise HTTPException(status_code=403, detail="Path traversal denied")

    if not _os.path.exists(target):
        return {"entries": []}

    if _os.path.isfile(target):
        stat = _os.stat(target)
        return {"entries": [{
            "name": _os.path.basename(target),
            "path": path,
            "type": "file",
            "size": stat.st_size,
            "modifiedAt": int(stat.st_mtime * 1000),
        }]}

    entries = []
    for entry in sorted(_os.listdir(target)):
        full = _os.path.join(target, entry)
        rel = f"{path}/{entry}" if path else entry
        stat = _os.stat(full)
        if _os.path.isdir(full):
            entries.append({"name": entry, "path": rel, "type": "directory", "modifiedAt": int(stat.st_mtime * 1000)})
        else:
            entries.append({"name": entry, "path": rel, "type": "file", "size": stat.st_size, "modifiedAt": int(stat.st_mtime * 1000)})
    return {"entries": entries}


@app.get("/sandbox/read")
async def api_sandbox_read(path: str):
    """Read a sandbox file."""
    import os as _os
    from pathlib import Path

    workdir = _os.environ.get("DEEP_SPACE_WORKDIR", str(Path.home() / "deepspace" / "workspace"))
    target = _os.path.join(workdir, path)
    target = _os.path.realpath(target)

    if not target.startswith(_os.path.realpath(workdir)):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    if not _os.path.exists(target):
        raise HTTPException(status_code=404, detail="File not found")
    if _os.path.isdir(target):
        raise HTTPException(status_code=400, detail="Path is a directory")

    size = _os.stat(target).st_size
    ext = _os.path.splitext(target)[1]
    lang_map = {".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript",
                ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".md": "markdown", ".html": "html",
                ".css": "css", ".sh": "bash", ".sql": "sql", ".txt": "text"}
    with open(target) as f:
        content = f.read()
    return {"content": content, "size": size, "language": lang_map.get(ext, "text")}


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


# ── Collab REST Endpoints ────────────────────

# In-memory collab session storage
_collab_sessions: dict[str, dict] = {}
_collab_msg_id = 0

AGENT_ROLES = [
    {"role": "EXECUTIVE", "name": "执行者", "description": "协调任务分解和资源分配", "systemPrompt": "你是执行者，负责协调和决策。", "icon": "👑"},
    {"role": "RESEARCH", "name": "研究员", "description": "搜索和分析信息", "systemPrompt": "你是研究员，负责信息收集和分析。", "icon": "🔍"},
    {"role": "MEMORY", "name": "记忆师", "description": "管理长期记忆和知识检索", "systemPrompt": "你是记忆师，负责记忆存储和检索。", "icon": "🧠"},
    {"role": "GRAPH", "name": "图谱师", "description": "构建和查询知识图谱", "systemPrompt": "你是图谱师，负责知识图谱操作。", "icon": "🕸️"},
    {"role": "PLANNING", "name": "规划师", "description": "制定执行计划", "systemPrompt": "你是规划师，负责任务分解和计划制定。", "icon": "📋"},
    {"role": "ACTION", "name": "执行器", "description": "执行具体操作", "systemPrompt": "你是执行器，负责执行具体任务。", "icon": "⚡"},
    {"role": "VERIFICATION", "name": "验证师", "description": "验证执行结果", "systemPrompt": "你是验证师，负责结果验证。", "icon": "✅"},
    {"role": "REFLECTION", "name": "反思者", "description": "反思和优化", "systemPrompt": "你是反思者，负责元认知和优化。", "icon": "🪞"},
    {"role": "PROACTIVE", "name": "主动者", "description": "预测需求并主动推送", "systemPrompt": "你是主动者，负责上下文感知和预测。", "icon": "🔮"},
]


@app.get("/collab/roles")
async def api_collab_roles():
    """List available collab agent roles."""
    return {"roles": AGENT_ROLES}


@app.get("/collab/sessions")
async def api_collab_sessions():
    """List all collab sessions."""
    return {"sessions": list(_collab_sessions.values())}


@app.get("/collab/sessions/{session_id}")
async def api_collab_session_get(session_id: str):
    """Get a single collab session."""
    session = _collab_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/collab/sessions")
async def api_collab_session_create(req: dict):
    """Create a new collab session."""
    global _collab_msg_id
    import uuid
    import time

    session_id = str(uuid.uuid4())[:8]
    agents = [a for a in req.get("agents", []) if any(r["role"] == a for r in AGENT_ROLES)]
    session = {
        "id": session_id,
        "task": req.get("task", ""),
        "agents": agents,
        "messages": [],
        "status": "planning",
        "createdAt": int(time.time() * 1000),
    }
    _collab_sessions[session_id] = session
    return session


@app.post("/collab/sessions/{session_id}/messages")
async def api_collab_session_message(session_id: str, req: dict):
    """Post a message to a collab session."""
    global _collab_msg_id
    import time

    session = _collab_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    _collab_msg_id += 1
    msg = {
        "id": str(_collab_msg_id),
        "from": req.get("from", ""),
        "to": req.get("to", ""),
        "content": req.get("content", ""),
        "type": req.get("type", "response"),
        "timestamp": int(time.time() * 1000),
    }
    session["messages"].append(msg)
    return msg


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
    orch = state.orchestrator

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
    orch = state.orchestrator
    return {"executions": orch.execution_history[-limit:]}


@app.post("/orchestrator/auto-solve")
async def api_auto_solve():
    """Derive and solve self-derived goals from knowledge gaps."""
    orch = state.orchestrator
    results = await orch.solve_self_derived_goals(max_goals=2)
    return {"results": results}


@app.get("/goals")
async def api_goals():
    """Get self-derived goals from reflection gaps."""
    orch = state.orchestrator
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
    engine = state.engine
    result = await engine.deduplicate(threshold=threshold, dry_run=dry_run)
    return result


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.8.1", "agents": 9, "features": ["memory", "graph", "learn", "execute", "recover", "dashboard", "export", "dedup", "notify", "timeline", "plugins", "auth", "analytics"]}


@app.get("/analytics")
async def api_analytics(days: int = 30):
    """Get memory analytics: trends, active projects, growth."""
    engine = state.engine

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
    engine = state.engine
    from core.timeline import TimelineGenerator
    gen = TimelineGenerator(engine, orchestrator=state.orchestrator)
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
    if state.llm and state.llm.router:
        return state.llm.router.status
    return {"error": "No router available"}


# ── Auth Profile ─────────────────────────────

@app.patch("/auth/me")
async def api_auth_me_update(request: Request):
    """Update user profile — bypass auth, accept any changes."""
    body = await request.json()
    return {
        "id": "local", "email": "dev@deepspace.local",
        "username": body.get("username", "dev"),
        "avatarUrl": body.get("avatarUrl"), "role": "admin",
        "createdAt": "2024-01-01T00:00:00Z", "lastLoginAt": None,
    }


# ── Conversations ────────────────────────────

_conversations: list[dict] = []
_conv_id = 0


@app.get("/conversations")
async def api_conversations():
    return {"conversations": _conversations}


@app.delete("/conversations/{conv_id}")
async def api_conversation_delete(conv_id: str):
    global _conversations
    _conversations = [c for c in _conversations if c["id"] != conv_id]
    return {"deleted": True}


@app.patch("/conversations/{conv_id}/title")
async def api_conversation_rename(conv_id: str, request: Request):
    body = await request.json()
    for c in _conversations:
        if c["id"] == conv_id:
            c["title"] = body.get("title", c["title"])
            return {"updated": True}
    return {"updated": False}


# ── Plugins ──────────────────────────────────

@app.get("/plugins")
async def api_plugins_list():
    """List installed plugins."""
    from core.plugin_manager import PluginManager
    manager = PluginManager()
    await manager.discover()
    return manager.status


@app.post("/plugins/{plugin_id}/reload")
async def api_plugin_reload(plugin_id: str):
    return {"pluginId": plugin_id, "reloaded": True}


@app.post("/plugins/{plugin_id}/toggle")
async def api_plugin_toggle(plugin_id: str, request: Request):
    body = await request.json()
    return {"success": True, "pluginId": plugin_id, "enabled": body.get("enabled", True), "toolCount": 0}


@app.post("/plugins/install")
async def api_plugin_install(request: Request):
    body = await request.json()
    import uuid
    return {"success": True, "id": str(uuid.uuid4())[:8], "name": body.get("dirPath", "unknown"), "toolCount": 0}


# ── Templates ────────────────────────────────

@app.get("/templates")
async def api_templates():
    return {"templates": [
        {"id": "general", "name": "通用助手", "description": "通用AI助手模板", "dna": "你是一个有用的AI助手。"},
        {"id": "coder", "name": "代码助手", "description": "专注于代码和开发", "dna": "你是一个专业的编程助手，擅长代码审查、调试和优化。"},
        {"id": "researcher", "name": "研究员", "description": "深度研究和分析", "dna": "你是一个研究助手，擅长深度分析和信息整合。"},
    ]}


# ── Marketplace ──────────────────────────────

_marketplace: dict[str, dict] = {}
_market_stars: dict[str, set[str]] = {}
_market_downloads: dict[str, int] = {}
_market_id = 0


@app.get("/marketplace")
async def api_marketplace(search: str = "", tag: str = "", limit: int = 20, offset: int = 0):
    agents = list(_marketplace.values())
    if search:
        agents = [a for a in agents if search.lower() in a.get("name", "").lower() or search.lower() in a.get("description", "").lower()]
    if tag:
        agents = [a for a in agents if tag in a.get("tags", [])]
    return {"agents": agents[offset:offset + limit], "total": len(agents)}


@app.get("/marketplace/{agent_id}")
async def api_marketplace_agent(agent_id: str):
    agent = _marketplace.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@app.post("/marketplace")
async def api_marketplace_publish(request: Request):
    global _market_id
    body = await request.json()
    _market_id += 1
    agent_id = str(_market_id)
    agent = {"id": agent_id, "name": body.get("name", ""), "description": body.get("description", ""),
             "tags": body.get("tags", []), "dna": body.get("dna", ""), "author": body.get("author", "dev"),
             "stars": 0, "downloads": 0, "createdAt": int(__import__("time").time() * 1000)}
    _marketplace[agent_id] = agent
    _market_stars[agent_id] = set()
    _market_downloads[agent_id] = 0
    return agent


@app.post("/marketplace/{agent_id}/star")
async def api_marketplace_star(agent_id: str):
    if agent_id not in _marketplace:
        raise HTTPException(status_code=404, detail="Agent not found")
    _market_stars.setdefault(agent_id, set()).add("local")
    _marketplace[agent_id]["stars"] = len(_market_stars[agent_id])
    return _marketplace[agent_id]


@app.post("/marketplace/{agent_id}/download")
async def api_marketplace_download(agent_id: str):
    if agent_id not in _marketplace:
        raise HTTPException(status_code=404, detail="Agent not found")
    _market_downloads[agent_id] = _market_downloads.get(agent_id, 0) + 1
    _marketplace[agent_id]["downloads"] = _market_downloads[agent_id]
    return {"downloads": _market_downloads[agent_id]}


@app.delete("/marketplace/{agent_id}")
async def api_marketplace_delete(agent_id: str):
    if agent_id not in _marketplace:
        raise HTTPException(status_code=404, detail="Agent not found")
    del _marketplace[agent_id]
    return {"deleted": True}


# ── Shares ───────────────────────────────────

_shares: dict[str, dict] = {}
_share_id = 0


@app.post("/shares")
async def api_shares_create(request: Request):
    global _share_id
    body = await request.json()
    _share_id += 1
    share_id = str(_share_id)
    share = {"id": share_id, "type": body.get("type", ""), "title": body.get("title", ""),
             "payload": body.get("payload", {}), "createdAt": int(__import__("time").time() * 1000)}
    _shares[share_id] = share
    return share


@app.get("/shares")
async def api_shares_list():
    return {"shares": list(_shares.values())}


@app.get("/shares/{share_id}")
async def api_shares_get(share_id: str):
    share = _shares.get(share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return share


@app.delete("/shares/{share_id}")
async def api_shares_delete(share_id: str):
    if share_id not in _shares:
        raise HTTPException(status_code=404, detail="Share not found")
    del _shares[share_id]
    return {"deleted": True}


# ── Traces ───────────────────────────────────

_traces: dict[str, dict] = {}
_trace_id = 0


@app.get("/traces")
async def api_traces(sessionId: str = ""):
    if sessionId:
        return {"traces": [t for t in _traces.values() if t.get("sessionId") == sessionId]}
    return {"traces": list(_traces.values())}


@app.get("/traces/{trace_id}")
async def api_traces_get(trace_id: str):
    trace = _traces.get(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@app.delete("/traces/{trace_id}")
async def api_traces_delete(trace_id: str):
    if trace_id not in _traces:
        raise HTTPException(status_code=404, detail="Trace not found")
    del _traces[trace_id]
    return {"deleted": True}


# ── Main ─────────────────────────────────────

# Wrap FastAPI with Socket.IO for collab support
app = socketio.ASGIApp(sio, app)


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