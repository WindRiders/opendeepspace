"""
Tests for PluginManager — discovery, loading, lifecycle, extension points.
"""
import asyncio
import json
import tempfile
from pathlib import Path

import pytest

from core.plugin_manager import (
    Plugin, PluginManifest, PluginManager,
)


class TestPluginManifest:
    def test_default_values(self):
        m = PluginManifest(name="test", version="1.0")
        assert m.name == "test"
        assert m.version == "1.0"
        assert m.description == ""
        assert m.author == ""
        assert m.license == "MIT"
        assert m.dependencies == []
        assert m.provides == []
        assert m.min_deepspace_version == "0.5.0"

    def test_full_manifest(self):
        m = PluginManifest(
            name="advanced", version="2.0",
            description="A plugin", author="dev",
            dependencies=["base"], provides=["action_x"],
            min_deepspace_version="0.8.0",
        )
        assert m.provides == ["action_x"]
        assert m.min_deepspace_version == "0.8.0"


class TestPluginLifecycle:
    def test_initial_state(self):
        p = Plugin(PluginManifest(name="p", version="1.0"))
        assert p.name == "p"
        assert p.loaded is False
        assert p.enabled is False

    def test_on_load(self):
        p = Plugin(PluginManifest(name="p", version="1.0"))
        mgr = PluginManager()
        asyncio.run(p.on_load(mgr))
        assert p.loaded is True
        assert p.enabled is False

    def test_on_enable_disable(self):
        p = Plugin(PluginManifest(name="p", version="1.0"))
        asyncio.run(p.on_enable())
        assert p.enabled is True

        asyncio.run(p.on_disable())
        assert p.enabled is False

    def test_on_unload(self):
        p = Plugin(PluginManifest(name="p", version="1.0"))
        asyncio.run(p.on_load(PluginManager()))
        assert p.loaded is True

        asyncio.run(p.on_unload())
        assert p.loaded is False

    def test_extension_points_return_empty(self):
        p = Plugin(PluginManifest(name="p", version="1.0"))
        assert p.get_action_handlers() == {}
        assert p.get_cli_commands() == []
        assert p.get_api_routes() is None
        assert p.get_memory_hooks() == {}
        assert p.get_execution_handlers() == {}


class TestPluginManagerInit:
    def test_default_dir(self):
        mgr = PluginManager()
        assert mgr.plugins_dir == Path("plugins")
        assert mgr.plugins == {}
        assert mgr._loaded is False

    def test_custom_dir(self):
        mgr = PluginManager(plugins_dir="./custom_plugins")
        assert str(mgr.plugins_dir) == "custom_plugins"


class TestPluginManagerDiscover:
    def test_nonexistent_dir(self):
        mgr = PluginManager(plugins_dir="/nonexistent/path/xyz")
        manifests = asyncio.run(mgr.discover())
        assert manifests == []

    def test_empty_dir(self, tmp_path):
        plugins_dir = tmp_path / "empty_plugins"
        plugins_dir.mkdir()
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert manifests == []

    def test_skips_underscore_dirs(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        hidden = plugins_dir / "_hidden_plugin"
        hidden.mkdir()
        (hidden / "plugin.json").write_text(
            json.dumps({"name": "hidden", "version": "1.0"})
        )
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert len(manifests) == 0

    def test_skips_dot_dirs(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        dot_dir = plugins_dir / ".hidden"
        dot_dir.mkdir()
        (dot_dir / "plugin.json").write_text(
            json.dumps({"name": "hidden", "version": "1.0"})
        )
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert len(manifests) == 0

    def test_skips_no_manifest(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        no_manifest = plugins_dir / "bad_plugin"
        no_manifest.mkdir()
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert len(manifests) == 0

    def test_discovers_valid_plugin(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        p_dir = plugins_dir / "my-plugin"
        p_dir.mkdir()
        (p_dir / "plugin.json").write_text(json.dumps({
            "name": "my-plugin", "version": "1.2.0",
            "description": "Test plugin", "provides": ["tool_x"],
        }))
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert len(manifests) == 1
        assert manifests[0].name == "my-plugin"
        assert manifests[0].version == "1.2.0"

    def test_invalid_json_skipped(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        p_dir = plugins_dir / "bad-json"
        p_dir.mkdir()
        (p_dir / "plugin.json").write_text("{not valid json")
        mgr = PluginManager(plugins_dir=str(plugins_dir))
        manifests = asyncio.run(mgr.discover())
        assert len(manifests) == 0


class TestPluginManagerLifecycle:
    def test_enable_disable_by_name(self):
        mgr = PluginManager()
        manifest = PluginManifest(name="test-p", version="1.0")
        plugin = Plugin(manifest)
        mgr.plugins["test-p"] = plugin

        result = asyncio.run(mgr.enable_plugin("test-p"))
        assert result is True
        assert plugin.enabled is True

        result = asyncio.run(mgr.disable_plugin("test-p"))
        assert result is True
        assert plugin.enabled is False

    def test_enable_missing_plugin(self):
        mgr = PluginManager()
        assert asyncio.run(mgr.enable_plugin("nonexistent")) is False
        assert asyncio.run(mgr.disable_plugin("nonexistent")) is False

    async def _load_and_enable(self, mgr):
        manifest = PluginManifest(name="p1", version="1.0")
        plugin = Plugin(manifest)
        mgr.plugins["p1"] = plugin
        await mgr.enable_all()

    def test_enable_all(self):
        mgr = PluginManager()
        asyncio.run(self._load_and_enable(mgr))
        assert mgr.plugins["p1"].enabled is True

    def test_disable_all(self):
        mgr = PluginManager()
        manifest = PluginManifest(name="p1", version="1.0")
        plugin = Plugin(manifest)
        mgr.plugins["p1"] = plugin
        asyncio.run(plugin.on_enable())
        asyncio.run(mgr.disable_all())
        assert plugin.enabled is False

    def test_unload_all(self):
        mgr = PluginManager()
        manifest = PluginManifest(name="p1", version="1.0")
        plugin = Plugin(manifest)
        mgr.plugins["p1"] = plugin
        asyncio.run(plugin.on_load(mgr))
        asyncio.run(mgr.unload_all())
        assert plugin.loaded is False
        assert len(mgr.plugins) == 0


class TestPluginManagerCollectors:
    def test_get_all_action_handlers_enabled_only(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = True
        p1.get_action_handlers = lambda: {"type_a": "fake_handler"}
        mgr.plugins["p1"] = p1

        handlers = mgr.get_all_action_handlers()
        assert "type_a" in handlers
        assert handlers["type_a"] == "fake_handler"

    def test_get_all_action_handlers_skips_disabled(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = False
        p1.get_action_handlers = lambda: {"type_a": "fake_handler"}
        mgr.plugins["p1"] = p1

        handlers = mgr.get_all_action_handlers()
        assert handlers == {}

    def test_get_all_execution_handlers(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = True
        p1.get_execution_handlers = lambda: {"exec_x": "fake_exec_handler"}
        mgr.plugins["p1"] = p1

        handlers = mgr.get_all_execution_handlers()
        assert "exec_x" in handlers

    def test_get_all_memory_hooks(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = True
        hooks = {"before_store": lambda: None}
        p1.get_memory_hooks = lambda: hooks
        mgr.plugins["p1"] = p1

        assert mgr.get_all_memory_hooks() == [hooks]

    def test_get_all_api_routers(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = True
        p1.get_api_routes = lambda: "fake_router"
        mgr.plugins["p1"] = p1

        routers = mgr.get_all_api_routers()
        assert len(routers) == 1
        assert routers[0] == ("p1", "fake_router")

    def test_get_all_api_routers_skips_none(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0"))
        p1._enabled = True
        p1.get_api_routes = lambda: None
        mgr.plugins["p1"] = p1

        assert mgr.get_all_api_routers() == []


class TestPluginManagerStatus:
    def test_status_empty(self):
        mgr = PluginManager(plugins_dir="./plugins")
        s = mgr.status
        assert s["plugins_dir"] == "plugins"
        assert s["loaded"] is False
        assert s["count"] == 0
        assert s["plugins"] == []

    def test_status_with_plugins(self):
        mgr = PluginManager()
        p1 = Plugin(PluginManifest(name="p1", version="1.0", provides=["tool_x"]))
        p1._enabled = True
        mgr.plugins["p1"] = p1

        s = mgr.status
        assert s["count"] == 1
        assert s["plugins"][0]["name"] == "p1"
        assert s["plugins"][0]["version"] == "1.0"
        assert s["plugins"][0]["enabled"] is True
        assert s["plugins"][0]["provides"] == ["tool_x"]