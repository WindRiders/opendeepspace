"""
MCP Server protocol tests — test MCPSession directly (no subprocess).
Verifies JSON-RPC 2.0 protocol compliance and tool execution.
Uses class-based async tests to match project's pytest-asyncio strict mode.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.mcp_server import MCPSession, MCP_TOOLS


@pytest.fixture
def session():
    """MCPSession without engine/orchestrator (file-only mode)."""
    return MCPSession(engine=None, orchestrator=None)


@pytest.fixture
def sandbox():
    """Temporary sandbox directory."""
    old = os.environ.get("SANDBOX_ROOT")
    with tempfile.TemporaryDirectory() as d:
        os.environ["SANDBOX_ROOT"] = d
        yield d
        if old:
            os.environ["SANDBOX_ROOT"] = old


@pytest.fixture
def sandbox_session(sandbox):
    """Session with sandbox."""
    return MCPSession(engine=None, orchestrator=None)


# ── JSON-RPC Protocol ───────────────────────────────────────

class TestMCPProtocol:
    def test_initialize(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}},
        }))
        assert resp["id"] == 1
        r = resp["result"]
        assert r["protocolVersion"] == "2024-11-05"
        assert r["serverInfo"]["name"] == "deepspace"
        assert r["serverInfo"]["version"] == "0.9.0"
        assert "tools" in r["capabilities"]

    def test_initialized_notification(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "method": "notifications/initialized", "params": {},
        }))
        assert resp is None

    def test_ping(self, session):
        resp = _run(session.handle_request({"jsonrpc": "2.0", "id": 1, "method": "ping"}))
        assert resp["id"] == 1
        assert resp["result"] == {}

    def test_method_not_found(self, session):
        resp = _run(session.handle_request({"jsonrpc": "2.0", "id": 1, "method": "nope"}))
        assert resp["error"]["code"] == -32601


# ── Tools List ──────────────────────────────────────────────

class TestToolsList:
    def test_count(self, session):
        resp = _run(session.handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
        assert len(resp["result"]["tools"]) == len(MCP_TOOLS) == 10

    def test_names(self, session):
        resp = _run(session.handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
        names = {t["name"] for t in resp["result"]["tools"]}
        expected = {"read_file", "write_file", "list_files", "shell_exec", "code_run",
                    "http_request", "memory_recall", "memory_remember", "graph_search", "solve_goal"}
        assert names == expected

    def test_valid_schemas(self, session):
        resp = _run(session.handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
        for tool in resp["result"]["tools"]:
            assert "name" in tool and tool["name"]
            assert "description" in tool and tool["description"]
            assert "inputSchema" in tool and isinstance(tool["inputSchema"], dict)


# ── Tool Execution ──────────────────────────────────────────

class TestFileTools:
    def test_write_and_read(self, sandbox_session, sandbox):
        content = "hello mcp test"
        w = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "write_file", "arguments": {"filePath": "t.txt", "content": content}},
        }))
        assert "File written" in w["result"]["content"][0]["text"]

        r = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "read_file", "arguments": {"filePath": "t.txt"}},
        }))
        assert content in r["result"]["content"][0]["text"]

    def test_list_files(self, sandbox_session, sandbox):
        _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "write_file", "arguments": {"filePath": "a.py", "content": "pass"}},
        }))
        resp = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "list_files", "arguments": {"dirPath": "."}},
        }))
        text = resp["result"]["content"][0]["text"]
        assert "a.py" in text

    def test_path_traversal_blocked(self, sandbox_session, sandbox):
        resp = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "read_file", "arguments": {"filePath": "../../etc/passwd"}},
        }))
        assert "path traversal blocked" in resp["result"]["content"][0]["text"]


class TestShellExec:
    def test_echo(self, sandbox_session, sandbox):
        resp = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "shell_exec", "arguments": {"command": "echo ok"}},
        }))
        assert "ok" in resp["result"]["content"][0]["text"]

    def test_dangerous_blocked(self, sandbox_session, sandbox):
        resp = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "shell_exec", "arguments": {"command": "rm -rf /etc"}},
        }))
        assert "SAFETY BLOCK" in resp["result"]["content"][0]["text"]

    def test_code_run_python(self, sandbox_session, sandbox):
        resp = _run(sandbox_session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "code_run", "arguments": {"language": "python", "code": "print(42)"}},
        }))
        assert "42" in resp["result"]["content"][0]["text"]


class TestMemoryTools:
    def test_recall_no_engine(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "memory_recall", "arguments": {"query": "x"}},
        }))
        assert "Memory engine not available" in resp["result"]["content"][0]["text"]

    def test_graph_search_no_engine(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "graph_search", "arguments": {"query": "x"}},
        }))
        assert "Knowledge graph not available" in resp["result"]["content"][0]["text"]

    def test_solve_goal_no_orchestrator(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "solve_goal", "arguments": {"goal": "test"}},
        }))
        assert "Orchestrator not available" in resp["result"]["content"][0]["text"]

    def test_unknown_tool(self, session):
        resp = _run(session.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "nonexistent", "arguments": {}},
        }))
        assert "Unknown tool" in resp["result"]["content"][0]["text"]


def _run(coro):
    """Run coroutine synchronously — matches project pattern (test_llm_client.py)."""
    import asyncio
    return asyncio.run(coro)