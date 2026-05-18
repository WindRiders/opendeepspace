"""
Plugin Manager — dynamic plugin discovery, loading, and lifecycle management.

Plugins extend DeepSpace with:
- Custom action types (new executor handlers)
- Custom storage backends (alternative to pgvector/Neo4j)
- Custom CLI commands (subcommands under deepspace)
- Custom API routes (FastAPI routers)
- Memory hooks (before/after store/recall)

Plugin structure:
  plugins/
    my-plugin/
      plugin.json     <- manifest
      __init__.py     <- Plugin class
      commands.py     <- optional CLI commands
      routes.py       <- optional API routes
"""
from __future__ import annotations

import importlib
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable

logger = logging.getLogger(__name__)


@dataclass
class PluginManifest:
    """Plugin metadata loaded from plugin.json."""
    name: str
    version: str
    description: str = ""
    author: str = ""
    license: str = "MIT"
    dependencies: list[str] = field(default_factory=list)
    provides: list[str] = field(default_factory=list)  # What this plugin adds
    min_deepspace_version: str = "0.5.0"


class Plugin:
    """Base class for all DeepSpace plugins."""

    def __init__(self, manifest: PluginManifest):
        self.manifest = manifest
        self._loaded = False
        self._enabled = False

    @property
    def name(self) -> str:
        return self.manifest.name

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def enabled(self) -> bool:
        return self._enabled

    # ── Lifecycle Hooks ──

    async def on_load(self, manager: "PluginManager") -> None:
        """Called when plugin is first loaded."""
        self._loaded = True
        logger.info(f"Plugin loaded: {self.name} v{self.manifest.version}")

    async def on_enable(self) -> None:
        """Called when plugin is enabled."""
        self._enabled = True

    async def on_disable(self) -> None:
        """Called when plugin is disabled."""
        self._enabled = False

    async def on_unload(self) -> None:
        """Called when plugin is removed."""
        self._loaded = False

    # ── Extension Points ──

    def get_action_handlers(self) -> dict[str, Callable]:
        """Return custom action type handlers. {type_name: handler_fn}."""
        return {}

    def get_cli_commands(self) -> list[dict]:
        """
        Return CLI command definitions.
        Each: {"name": str, "callback": fn, "help": str, "params": list}
        """
        return []

    def get_api_routes(self):
        """Return a FastAPI APIRouter or None."""
        return None

    def get_memory_hooks(self) -> dict[str, Callable]:
        """
        Return memory hooks.
        {"before_store": fn, "after_store": fn, "before_recall": fn, "after_recall": fn}
        """
        return {}

    def get_execution_handlers(self) -> dict[str, Callable]:
        """
        Return custom execution handlers for action types.
        {action_type: async_handler_fn(step, executor)}
        """
        return {}


class PluginManager:
    """
    Discovers, loads, and manages plugins.

    Usage:
      manager = PluginManager(plugins_dir="./plugins")
      await manager.discover()
      await manager.load_all()
      await manager.enable_all()
    """

    def __init__(self, plugins_dir: str = "plugins"):
        self.plugins_dir = Path(plugins_dir)
        self.plugins: dict[str, Plugin] = {}
        self._loaded = False

    # ── Discovery ──

    async def discover(self) -> list[PluginManifest]:
        """Scan the plugins directory for valid plugins. Returns discovered manifests."""
        manifests = []
        if not self.plugins_dir.exists():
            logger.debug(f"Plugins directory not found: {self.plugins_dir}")
            return manifests

        for plugin_dir in sorted(self.plugins_dir.iterdir()):
            if not plugin_dir.is_dir() or plugin_dir.name.startswith(("_", ".")):
                continue

            manifest_path = plugin_dir / "plugin.json"
            if not manifest_path.exists():
                logger.warning(f"No plugin.json in {plugin_dir.name}")
                continue

            try:
                manifest_data = json.loads(manifest_path.read_text())
                manifest = PluginManifest(
                    name=manifest_data.get("name", plugin_dir.name),
                    version=manifest_data.get("version", "0.1.0"),
                    description=manifest_data.get("description", ""),
                    author=manifest_data.get("author", ""),
                    license=manifest_data.get("license", "MIT"),
                    dependencies=manifest_data.get("dependencies", []),
                    provides=manifest_data.get("provides", []),
                    min_deepspace_version=manifest_data.get("min_deepspace_version", "0.5.0"),
                )
                manifests.append(manifest)
                logger.debug(f"Discovered plugin: {manifest.name} v{manifest.version}")
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Invalid plugin.json in {plugin_dir.name}: {e}")

        return manifests

    # ── Loading ──

    async def load_plugin(self, manifest: PluginManifest) -> Optional[Plugin]:
        """Load a single plugin from its manifest."""
        plugin_dir = self.plugins_dir / manifest.name

        if not plugin_dir.exists():
            logger.error(f"Plugin directory not found: {plugin_dir}")
            return None

        # Check version compatibility
        from cli.deepspace import VERSION
        if manifest.min_deepspace_version > VERSION:
            logger.error(
                f"Plugin {manifest.name} requires DeepSpace >= {manifest.min_deepspace_version}, "
                f"current is {VERSION}"
            )
            return None

        # Check dependencies
        for dep in manifest.dependencies:
            if dep not in self.plugins:
                logger.warning(
                    f"Plugin {manifest.name} depends on '{dep}' which is not loaded"
                )

        # Import the plugin module
        sys.path.insert(0, str(self.plugins_dir.parent))
        try:
            module = importlib.import_module(f"plugins.{manifest.name}")
            # Find the Plugin subclass
            plugin_instance = None
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, Plugin)
                    and attr is not Plugin
                ):
                    plugin_instance = attr(manifest)
                    break

            if plugin_instance is None:
                # Create a basic Plugin instance
                plugin_instance = Plugin(manifest)

            await plugin_instance.on_load(self)
            self.plugins[manifest.name] = plugin_instance
            return plugin_instance

        except ImportError as e:
            logger.error(f"Failed to import plugin {manifest.name}: {e}")
            return None
        finally:
            if str(self.plugins_dir.parent) in sys.path:
                sys.path.remove(str(self.plugins_dir.parent))

    async def load_all(self) -> dict[str, Plugin]:
        """Discover and load all plugins."""
        manifests = await self.discover()
        for manifest in manifests:
            await self.load_plugin(manifest)
        self._loaded = True
        logger.info(f"PluginManager: Loaded {len(self.plugins)} plugin(s)")
        return dict(self.plugins)

    # ── Lifecycle ──

    async def enable_all(self):
        """Enable all loaded plugins."""
        for plugin in self.plugins.values():
            await plugin.on_enable()

    async def disable_all(self):
        """Disable all plugins."""
        for plugin in self.plugins.values():
            await plugin.on_disable()

    async def unload_all(self):
        """Unload all plugins."""
        for plugin in list(self.plugins.values()):
            await plugin.on_unload()
        self.plugins.clear()

    async def enable_plugin(self, name: str) -> bool:
        if name in self.plugins:
            await self.plugins[name].on_enable()
            return True
        return False

    async def disable_plugin(self, name: str) -> bool:
        if name in self.plugins:
            await self.plugins[name].on_disable()
            return True
        return False

    # ── Extension Point Collectors ──

    def get_all_action_handlers(self) -> dict[str, Callable]:
        """Get custom action handlers from all enabled plugins."""
        handlers = {}
        for plugin in self.plugins.values():
            if plugin.enabled:
                handlers.update(plugin.get_action_handlers())
        return handlers

    def get_all_execution_handlers(self) -> dict[str, Callable]:
        """Get custom execution handlers from all enabled plugins."""
        handlers = {}
        for plugin in self.plugins.values():
            if plugin.enabled:
                handlers.update(plugin.get_execution_handlers())
        return handlers

    def get_all_memory_hooks(self) -> list[dict[str, Callable]]:
        """Get memory hooks from all enabled plugins."""
        return [
            plugin.get_memory_hooks()
            for plugin in self.plugins.values()
            if plugin.enabled
        ]

    def get_all_api_routers(self):
        """Get FastAPI routers from all enabled plugins."""
        routers = []
        for plugin in self.plugins.values():
            if plugin.enabled:
                router = plugin.get_api_routes()
                if router:
                    routers.append((plugin.name, router))
        return routers

    @property
    def status(self) -> dict:
        return {
            "plugins_dir": str(self.plugins_dir),
            "loaded": self._loaded,
            "count": len(self.plugins),
            "plugins": [
                {
                    "name": p.name,
                    "version": p.manifest.version,
                    "enabled": p.enabled,
                    "description": p.manifest.description,
                    "provides": p.manifest.provides,
                }
                for p in self.plugins.values()
            ],
        }