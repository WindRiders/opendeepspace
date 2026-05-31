"""
DeepSpace MCP Server — Model Context Protocol over stdio.

Run: python -m api.mcp_server
Config (Claude Desktop):
{
  "mcpServers": {
    "deepspace": {
      "command": "python",
      "args": ["-m", "api.mcp_server"],
      "cwd": "/path/to/deepspace"
    }
  }
}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.agent_executor import SafetyChecker

logger = logging.getLogger("deepspace.mcp")

# ─── Tool Definitions (MCP format) ──────────────────────────

MCP_TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file from the sandbox filesystem.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string", "description": "Path to the file to read (relative to sandbox root)."}
            },
            "required": ["filePath"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file in the sandbox filesystem.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string", "description": "Path to the file to write."},
                "content": {"type": "string", "description": "Content to write to the file."},
            },
            "required": ["filePath", "content"],
        },
    },
    {
        "name": "list_files",
        "description": "List files and directories in a sandbox directory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dirPath": {"type": "string", "description": "Directory to list (defaults to root)."}
            },
        },
    },
    {
        "name": "shell_exec",
        "description": "Execute a safe shell command in the sandbox.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to execute."}
            },
            "required": ["command"],
        },
    },
    {
        "name": "code_run",
        "description": "Execute a Python, JavaScript, or Bash code snippet.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "language": {"type": "string", "description": "Programming language (python, javascript, bash)."},
                "code": {"type": "string", "description": "Code to execute."},
            },
            "required": ["language", "code"],
        },
    },
    {
        "name": "http_request",
        "description": "Make an HTTP request (GET, POST, PUT, DELETE).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "description": "HTTP method."},
                "url": {"type": "string", "description": "URL to request."},
                "body": {"type": "string", "description": "Request body (for POST/PUT)."},
                "headers_json": {"type": "string", "description": "JSON-encoded headers."},
            },
            "required": ["url"],
        },
    },
    {
        "name": "memory_recall",
        "description": "Search the agent's memory for relevant information using hybrid semantic+keyword search.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "top_k": {"type": "integer", "description": "Number of results (default 5)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "memory_remember",
        "description": "Store a memory in the agent's long-term memory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Content to remember."},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags for categorization."},
            },
            "required": ["content"],
        },
    },
    {
        "name": "graph_search",
        "description": "Search the knowledge graph for entities and relations.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Entity name or keyword to search."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "solve_goal",
        "description": "Autonomously plan and execute a multi-step goal using the agent orchestrator.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "goal": {"type": "string", "description": "Goal description."},
                "context": {"type": "string", "description": "Additional context."},
            },
            "required": ["goal"],
        },
    },
]


class MCPSession:
    """Manages one MCP client connection."""

    def __init__(self, engine=None, orchestrator=None):
        self.engine = engine
        self.orchestrator = orchestrator
        self._initialized = False

    async def handle_request(self, request: dict) -> dict | None:
        """Handle a JSON-RPC request. Returns response dict or None for notifications."""
        method = request.get("method", "")
        req_id = request.get("id")
        params = request.get("params", {})

        if method == "initialize":
            return self._response(req_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                },
                "serverInfo": {
                    "name": "deepspace",
                    "version": "0.9.0",
                },
            })

        if method == "notifications/initialized":
            self._initialized = True
            return None  # Notification — no response

        if method == "tools/list":
            return self._response(req_id, {"tools": MCP_TOOLS})

        if method == "tools/call":
            tool_name = params.get("name", "")
            arguments = params.get("arguments", {})
            result = await self._execute_tool(tool_name, arguments)
            return self._response(req_id, result)

        if method == "ping":
            return self._response(req_id, {})

        return self._error(req_id, -32601, f"Method not found: {method}")

    async def _execute_tool(self, name: str, args: dict) -> dict:
        """Execute a tool and return MCP-formatted result."""
        try:
            result_text = await self._run_tool(name, args)
            return {
                "content": [{"type": "text", "text": result_text[:2000]}],
            }
        except Exception as e:
            logger.exception(f"Tool {name} failed")
            return {
                "content": [{"type": "text", "text": f"Error: {e}"}],
                "isError": True,
            }

    async def _run_tool(self, name: str, args: dict) -> str:
        """Execute a specific tool."""
        sandbox = os.environ.get("SANDBOX_ROOT", os.path.expanduser("~/deepspace-sandbox"))
        os.makedirs(sandbox, exist_ok=True)

        if name == "read_file":
            path = os.path.join(sandbox, args.get("filePath", ""))
            path = os.path.normpath(path)
            if not path.startswith(os.path.normpath(sandbox)):
                return "Error: path traversal blocked."
            try:
                with open(path) as f:
                    content = f.read()
                return content[:50000]
            except FileNotFoundError:
                return f"File not found: {args.get('filePath')}"
            except Exception as e:
                return f"Read error: {e}"

        if name == "write_file":
            path = os.path.join(sandbox, args.get("filePath", ""))
            path = os.path.normpath(path)
            if not path.startswith(os.path.normpath(sandbox)):
                return "Error: path traversal blocked."
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(args.get("content", ""))
            return f"File written: {args.get('filePath')}"

        if name == "list_files":
            dir_path = os.path.join(sandbox, args.get("dirPath", ""))
            dir_path = os.path.normpath(dir_path)
            if not dir_path.startswith(os.path.normpath(sandbox)):
                return "Error: path traversal blocked."
            try:
                entries = os.listdir(dir_path)
                lines = []
                for e in sorted(entries):
                    full = os.path.join(dir_path, e)
                    tag = "[DIR]" if os.path.isdir(full) else "[FILE]"
                    lines.append(f"{tag} {e}")
                return "\n".join(lines) or "(empty)"
            except FileNotFoundError:
                return f"Directory not found: {args.get('dirPath', '.')}"

        if name == "shell_exec":
            command = args.get("command", "")
            is_dangerous, reason = SafetyChecker.is_dangerous(command)
            if is_dangerous:
                return f"SAFETY BLOCK: {reason}"
            try:
                proc = await asyncio.create_subprocess_shell(
                    command, cwd=sandbox,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=30,
                )
                return stdout.decode()[:50000] or stderr.decode()[:50000] or "(no output)"
            except asyncio.TimeoutError:
                return "Command timed out (30s)."
            except Exception as e:
                return f"Command error: {e}"

        if name == "code_run":
            language = args.get("language", "").lower()
            code = args.get("code", "")
            ext_map = {"python": ".py", "javascript": ".js", "bash": ".sh", "js": ".js", "py": ".py", "sh": ".sh"}
            ext = ext_map.get(language, ".txt")
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=ext, dir=sandbox, delete=False) as f:
                f.write(code)
                tmp_path = f.name
            try:
                if language in ("python", "py"):
                    cmd = f"python3 {tmp_path}"
                elif language in ("javascript", "js"):
                    cmd = f"node {tmp_path}"
                elif language in ("bash", "sh"):
                    cmd = f"bash {tmp_path}"
                else:
                    return f"Unsupported language: {language}"
                proc = await asyncio.create_subprocess_shell(
                    cmd, cwd=sandbox,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=30,
                )
                return stdout.decode()[:10000] or stderr.decode()[:10000] or "(no output)"
            except asyncio.TimeoutError:
                return "Code execution timed out (30s)."
            finally:
                os.unlink(tmp_path)

        if name == "http_request":
            import urllib.request
            url = args.get("url", "")
            method = (args.get("method") or "GET").upper()
            body = args.get("body") or None
            try:
                req = urllib.request.Request(url, data=body.encode() if body else None, method=method)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.read().decode()[:10000]
            except Exception as e:
                return f"HTTP error: {e}"

        if name == "memory_recall":
            if not self.engine:
                return "Memory engine not available (database offline)."
            try:
                memories = self.engine.recall(
                    query=args.get("query", ""),
                    top_k=args.get("top_k", 5),
                )
                lines = []
                for m in (memories or [])[:5]:
                    lines.append(f"[{getattr(m, 'memory_type', '?')}|importance:{getattr(m, 'importance', 0):.2f}] {getattr(m, 'content', '')[:200]}")
                return "\n".join(lines) or "No memories found."
            except Exception as e:
                return f"Memory search error: {e}"

        if name == "memory_remember":
            if not self.engine:
                return "Memory engine not available."
            try:
                self.engine.remember(
                    content=args.get("content", ""),
                    tags=list(args.get("tags", [])),
                    source="mcp",
                )
                return "Memory stored."
            except Exception as e:
                return f"Memory store error: {e}"

        if name == "graph_search":
            if not self.engine or not hasattr(self.engine, 'graph_store') or not self.engine.graph_store:
                return "Knowledge graph not available (Neo4j offline)."
            try:
                entities = self.engine.graph_store.search_entities(
                    query=args.get("query", ""),
                    top_k=5,
                )
                lines = []
                for e in (entities or []):
                    lines.append(f"[{getattr(e, 'type', '?')}] {getattr(e, 'name', '?')} — {getattr(e, 'description', '')[:100]}")
                return "\n".join(lines) or "No entities found."
            except Exception as e:
                return f"Graph search error: {e}"

        if name == "solve_goal":
            if not self.orchestrator:
                return "Orchestrator not available."
            try:
                result = await self.orchestrator.solve_goal(
                    description=args.get("goal", ""),
                    context=args.get("context", ""),
                    mode="semi_auto",
                )
                return (
                    f"Outcome: {result.get('outcome', 'unknown')}\n"
                    f"Steps: {result.get('steps_passed', 0)}/{result.get('steps_total', 0)}\n"
                    f"Summary: {result.get('summary', '')}"
                )[:2000]
            except Exception as e:
                return f"Solve error: {e}"

        return f"Unknown tool: {name}"

    def _response(self, req_id: Any, result: Any) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def _error(self, req_id: Any, code: int, message: str) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


async def serve_stdio():
    """Run MCP server with stdio transport (for Claude Desktop)."""
    logging.basicConfig(level=logging.WARNING)

    # Try to initialize engine components
    engine = None
    orchestrator = None

    try:
        import yaml
        config_path = os.path.expanduser("~/deepspace/config/config.yaml")
        if not os.path.exists(config_path):
            config_path = os.path.join(os.path.dirname(__file__), "..", "config", "config.yaml")
        if not os.path.exists(config_path):
            config_path = "/app/config/config.yaml"  # Docker path
        if os.path.exists(config_path):
            import re
            with open(config_path) as f:
                raw = f.read()
            raw = re.sub(r'\$\{(\w+)\}', lambda m: os.environ.get(m.group(1), ""), raw)
            config = yaml.safe_load(raw)

            llm_config = config.get("llm", {})
            from core.model_router import ModelRouter
            from core.llm_client import LLMClient
            router = ModelRouter(config)
            llm = LLMClient(config, router=router)

            try:
                from storage.pgvector_store import create_store as create_pg
                pg_store = create_pg(config)
            except Exception:
                pg_store = None

            try:
                from storage.neo4j_store import create_graph_store
                graph_store = create_graph_store(config)
            except Exception:
                graph_store = None

            from core.memory_engine import MemoryEngine
            engine = MemoryEngine(llm=llm, vector_store=pg_store, graph_store=graph_store, config=config)

            try:
                from core.orchestrator import Orchestrator
                orchestrator = Orchestrator(engine=engine, llm=llm, config=config)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Engine init skipped (tools operate in file-only mode): {e}")

    session = MCPSession(engine=engine, orchestrator=orchestrator)
    reader = asyncio.StreamReader()
    loop = asyncio.get_event_loop()

    # Read stdin line by line (JSON-RPC messages are newline-delimited)
    def feed():
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            reader.feed_data(line.encode())

    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    loop.run_in_executor(executor, feed)

    while True:
        try:
            line = await asyncio.wait_for(reader.readline(), timeout=3600)
            if not line:
                break
            request = json.loads(line.decode().strip())
            response = await session.handle_request(request)
            if response is not None:
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
        except asyncio.TimeoutError:
            break
        except json.JSONDecodeError:
            continue
        except Exception as e:
            logger.exception("MCP handler error")
            break


if __name__ == "__main__":
    asyncio.run(serve_stdio())