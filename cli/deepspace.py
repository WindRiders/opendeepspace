#!/usr/bin/env python3
"""
DeepSpace CLI — Autonomous Learning Memory System.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import click
import yaml
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.markdown import Markdown
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import print as rprint

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import MemoryLayer, MemoryType
from storage.pgvector_store import PgVectorStore, create_store
from storage.neo4j_store import Neo4jGraphStore, create_graph_store

VERSION = "0.6.0"

console = Console()
logger = logging.getLogger("deepspace")


def load_config(config_path: str = "config/config.yaml") -> dict:
    """Load configuration from YAML file."""
    path = Path(config_path).expanduser().resolve()
    if not path.exists():
        # Try relative to ~/deepspace
        alt = Path.home() / "deepspace" / "config" / "config.yaml"
        if alt.exists():
            path = alt
        else:
            raise FileNotFoundError(f"Config not found: {config_path} or {alt}")

    with open(path) as f:
        raw = f.read()

    # Expand environment variables
    import re
    def expand_env(match):
        return os.environ.get(match.group(1), "")
    raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)

    config = yaml.safe_load(raw)

    # Fallback: read API key from Hermes config if not set
    if not config.get("llm", {}).get("api_key") or config["llm"]["api_key"].startswith("$"):
        hermes_config = Path.home() / ".hermes" / "config.yaml"
        if hermes_config.exists():
            with open(hermes_config) as hf:
                hconfig = yaml.safe_load(hf)
            # Try to find API key in Hermes config providers
            providers = hconfig.get("custom_providers", [])
            if isinstance(providers, dict):
                providers = list(providers.values())
            for provider_cfg in providers:
                if isinstance(provider_cfg, dict) and "dashscope" in provider_cfg.get("base_url", ""):
                    config["llm"]["api_key"] = provider_cfg.get("api_key", "")
                    break

    return config


async def init_engine(config: dict) -> MemoryEngine:
    """Initialize the memory engine with all backends."""
    llm = LLMClient(config)
    vector_store = await create_store(config)
    graph_store = await create_graph_store(config)
    engine = MemoryEngine(llm, vector_store, graph_store, config)
    return engine


@click.group(invoke_without_command=True)
@click.option("--config", "-c", default="config/config.yaml", help="Config file path")
@click.option("--version", "-V", is_flag=True, help="Show version and exit")
@click.option("--json", "-j", "json_output", is_flag=True, help="Output in JSON format (machine-readable)")
@click.pass_context
def cli(ctx, config, version, json_output):
    """DeepSpace —   Autonomous Learning Memory System.

    Four-layer memory + Neo4j knowledge graph + autonomous learner
    + proactive prediction + autonomous problem-solving.

    Quick start:
      deepspace init          # Interactive setup wizard
      deepspace remember ...  # Store a memory
      deepspace recall ...    # Search memories
      deepspace solve ...     # Autonomous problem-solving

    All commands support --json/-j for machine-readable output.
    Docs: https://windriders.github.io/opendeepspace/
    """
    if version:
        if json_output:
            console.print_json(json.dumps({"version": VERSION, "name": "DeepSpace"}))
        else:
            console.print(f"DeepSpace v{VERSION} — Autonomous Learning Memory System")
        ctx.exit()

    if ctx.invoked_subcommand is None:
        if json_output:
            console.print_json(json.dumps({
                "version": VERSION,
                "name": "DeepSpace",
                "commands": sorted(cli.list_commands(ctx)),
            }))
        else:
            console.print(Panel.fit(
                f"[bold cyan]DeepSpace v{VERSION}[/] —   Autonomous Learning Memory System\n\n"
                f"[dim]Four-layer memory + Neo4j knowledge graph + autonomous execution[/]\n\n"
                f"[bold]Quick start:[/]  deepspace init\n"
                f"[bold]Store:[/]      deepspace remember \"content\"\n"
                f"[bold]Search:[/]     deepspace recall \"query\"\n"
                f"[bold]Auto-solve:[/] deepspace solve \"goal\"\n"
                f"[bold]Full auto:[/]  deepspace auto-solve\n\n"
                f"[dim]Run 'deepspace --help' for all commands. '--json' for machine output.[/]",
                title="  Welcome",
                border_style="blue",
            ))

    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config
    ctx.obj["json_output"] = json_output


@cli.command()
@click.argument("content")
@click.option("--layer", "-l", type=click.Choice([l.value for l in MemoryLayer]),
              default="short_term", help="Memory layer")
@click.option("--project", "-p", default="", help="Associated project")
@click.option("--tags", "-t", default="", help="Comma-separated tags")
@click.option("--source", "-s", default="cli", help="Memory source")
@click.pass_context
def remember(ctx, content, layer, project, tags, source):
    """Store a new memory."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]

        memory = await engine.remember(
            content=content,
            layer=MemoryLayer(layer),
            project=project,
            tags=tag_list,
            source=source,
        )

        console.print(Panel.fit(
            f"[bold green]✓ Remembered[/]\n"
            f"ID: {memory.id}\n"
            f"Layer: {memory.layer.value}\n"
            f"Type: {memory.memory_type.value}\n"
            f"Importance: {memory.importance:.2f}\n"
            f"Summary: {memory.summary or memory.content[:100]}",
            title="Memory Stored"
        ))

    asyncio.run(_run())


@cli.command()
@click.argument("query")
@click.option("--layer", "-l", type=click.Choice([l.value for l in MemoryLayer]),
              default=None, help="Filter by layer")
@click.option("--project", "-p", default=None, help="Filter by project")
@click.option("--top-k", "-k", default=10, help="Number of results")
@click.pass_context
def recall(ctx, query, layer, project, top_k):
    """Search memories (hybrid: vector + keyword)."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        results = await engine.recall(
            query=query,
            layer=MemoryLayer(layer) if layer else None,
            project=project,
            top_k=top_k,
        )

        if not results:
            console.print("[yellow]No memories found.[/]")
            return

        table = Table(title=f"Recall Results for: {query}")
        table.add_column("#", style="dim", width=3)
        table.add_column("ID", style="dim", width=16)
        table.add_column("Content", width=50)
        table.add_column("Layer", width=12)
        table.add_column("Importance", width=10)

        for i, m in enumerate(results, 1):
            table.add_row(
                str(i), m.id,
                (m.summary or m.content)[:80],
                m.layer.value,
                f"{m.importance:.2f}",
            )

        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.argument("memory_id")
@click.pass_context
def show(ctx, memory_id):
    """Show full details of a memory."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        memory = await engine.get_memory(memory_id)
        if not memory:
            console.print(f"[red]Memory {memory_id} not found.[/]")
            return

        console.print(Panel(
            memory.content,
            title=f"Memory: {memory.id}",
            subtitle=f"Layer: {memory.layer.value} | Type: {memory.memory_type.value} | "
                     f"Importance: {memory.importance:.2f} | Created: {memory.created_at}"
        ))
        if memory.tags:
            console.print(f"Tags: {', '.join(memory.tags)}")
        if memory.project:
            console.print(f"Project: {memory.project}")
        if memory.summary and memory.summary != memory.content:
            console.print(f"\n[bold]Summary:[/] {memory.summary}")

    asyncio.run(_run())


@cli.command()
@click.pass_context
def consolidate(ctx):
    """Run memory consolidation: promote, graph, forget."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        with console.status("[bold green]Consolidating memories...[/]"):
            result = await engine.consolidate()

        table = Table(title="Consolidation Results")
        table.add_column("Metric", style="bold")
        table.add_column("Count")

        table.add_row("Short-term processed", str(result.short_term_processed))
        table.add_row("Promoted → Working", str(result.promoted_to_working))
        table.add_row("Promoted → Long-term", str(result.promoted_to_long_term))
        table.add_row("Entities extracted", str(result.entities_extracted))
        table.add_row("Relations inferred", str(result.relations_inferred))
        table.add_row("Forgotten (stale)", str(result.forgotten))
        if result.errors:
            table.add_row("Errors", str(len(result.errors)))

        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.pass_context
def reflect(ctx):
    """Run meta-cognition reflection."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        with console.status("[bold blue]Reflecting on knowledge...[/]"):
            reflection = await engine.reflect()

        console.print(Panel(
            reflection.get("knowledge_summary", "No reflection available."),
            title="Knowledge Summary"
        ))

        if reflection.get("strengths"):
            console.print("\n[bold green]Strengths:[/]")
            for s in reflection["strengths"]:
                console.print(f"  • {s['domain']} (confidence: {s['confidence']:.2f})")

        if reflection.get("gaps"):
            console.print("\n[bold yellow]Knowledge Gaps:[/]")
            for g in sorted(reflection["gaps"], key=lambda x: x.get("priority", 0), reverse=True):
                console.print(f"  • {g['topic']} — {g['reason']} [priority: {g['priority']:.2f}]")

        if reflection.get("recommendations"):
            console.print("\n[bold blue]Recommendations:[/]")
            for r in reflection["recommendations"]:
                console.print(f"  • {r}")

    asyncio.run(_run())


@cli.command()
@click.pass_context
def stats(ctx):
    """Show memory statistics."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        s = await engine.stats()

        table = Table(title="Memory Statistics")
        table.add_column("Layer", style="bold")
        table.add_column("Count")
        for layer_name, count in s["by_layer"].items():
            table.add_row(layer_name, str(count))
        table.add_row("[bold]Total[/]", f"[bold]{s['total_memories']}[/]")
        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.argument("name")
@click.argument("path")
@click.option("--description", "-d", default="", help="Project description")
@click.option("--tech", "-t", default="", help="Comma-separated tech stack")
@click.pass_context
def project(ctx, name, path, description, tech):
    """Register a project context."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        tech_list = [t.strip() for t in tech.split(",") if t.strip()]

        await engine.set_project_context(
            name=name,
            path=path,
            description=description,
            tech_stack=tech_list,
        )
        console.print(f"[green]✓ Project '{name}' registered.[/]")

    asyncio.run(_run())


@cli.command()
@click.pass_context
def projects(ctx):
    """List registered projects."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        projects = await engine.get_active_projects()
        if not projects:
            console.print("[yellow]No projects registered.[/]")
            return

        table = Table(title="Registered Projects")
        table.add_column("Name", style="bold")
        table.add_column("Path")
        table.add_column("Description")
        table.add_column("Tech Stack")

        for p in projects:
            table.add_row(
                p.name, p.path,
                p.description[:40] if p.description else "-",
                ", ".join(p.tech_stack) if p.tech_stack else "-",
            )
        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.argument("query")
@click.option("--type", "-t", "entity_type", default=None, help="Entity type filter")
@click.pass_context
def graph(ctx, query, entity_type):
    """Search the knowledge graph for entities."""
    async def _run():
        from core.models import EntityType
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        entities = await engine.graph_store.search_entities(
            query=query,
            entity_type=EntityType(entity_type) if entity_type else None,
            top_k=15,
        )

        if not entities:
            console.print("[yellow]No entities found.[/]")
            return

        table = Table(title=f"Graph Search: {query}")
        table.add_column("Name", style="bold")
        table.add_column("Type", width=12)
        table.add_column("Description", width=50)
        table.add_column("Confidence")

        for e in entities:
            table.add_row(
                e.name, e.entity_type.value,
                e.description[:60] if e.description else "-",
                f"{e.confidence:.2f}",
            )
        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.argument("entity_name")
@click.pass_context
def neighbors(ctx, entity_name):
    """Show neighbors of an entity in the knowledge graph."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        entities = await engine.graph_store.search_entities(entity_name, top_k=1)
        if not entities:
            console.print(f"[yellow]Entity '{entity_name}' not found.[/]")
            return

        entity = entities[0]
        neighbors_list = await engine.graph_store.get_neighbors(entity.id)

        if not neighbors_list:
            console.print(f"[yellow]Entity '{entity.name}' has no neighbors.[/]")
            return

        table = Table(title=f"Neighbors of: {entity.name} ({entity.entity_type.value})")
        table.add_column("Neighbor", style="bold")
        table.add_column("Type")
        table.add_column("Relation")
        table.add_column("Confidence")

        for neighbor, relation in neighbors_list:
            table.add_row(
                neighbor.name, neighbor.entity_type.value,
                relation.relation_type.value,
                f"{relation.confidence:.2f}",
            )
        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.option("--once", "-1", is_flag=True, help="Run one learning cycle and exit")
@click.option("--interval", "-i", default=15, help="Check interval in minutes")
@click.pass_context
def learn(ctx, once, interval):
    """Run the autonomous learner (research + integration)."""

    async def _run():
        from core.models import LearningTaskStatus
        from core.autonomous_learner import AutonomousLearner

        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        learner = AutonomousLearner(engine, engine.llm, config)

        if once:
            console.print("[bold]Running one learning cycle...[/]")
            task = await learner.check_and_learn(force=True)
            if task and task.status == LearningTaskStatus.COMPLETED:
                console.print(Panel(
                    task.findings[:500] + ("..." if len(task.findings) > 500 else ""),
                    title=f"Learned: {task.title}",
                    subtitle=f"Priority: {task.priority:.2f}"
                ))
            elif task:
                console.print(f"[yellow]Task status: {task.status.value}[/]")
            else:
                console.print("[yellow]System busy or no tasks to learn.[/]")
        else:
            console.print(f"[bold]Starting autonomous learner (interval: {interval} min)...[/]")
            console.print("[dim]Press Ctrl+C to stop.[/]")
            try:
                await learner.run_loop(interval_minutes=interval)
            except KeyboardInterrupt:
                learner.stop()
                console.print("\n[green]Learner stopped.[/]")

    asyncio.run(_run())


@cli.command()
@click.option("--non-interactive", "-y", is_flag=True, help="Skip prompts, use defaults")
@click.option("--api-key", default=None, help="DashScope API key (sk-...)")
@click.pass_context
def init(ctx, non_interactive, api_key):
    """Interactive setup wizard — configure and start DeepSpace in one command.

    Detects Docker, configures API key, validates LLM connection,
    starts databases, initializes schema. Everything needed to go
    from zero to running.

    Examples:
      deepspace init              # Full interactive wizard
      deepspace init -y           # Non-interactive with defaults
      deepspace init --api-key sk-xxx  # Provide API key directly
    """
    import subprocess
    import time
    import re

    console.print(Panel.fit(
        "[bold cyan]DeepSpace Setup Wizard[/]\n"
        f"[dim]v{VERSION} — Autonomous Learning Memory System[/]",
        border_style="cyan",
    ))
    console.print()

    # ── Step 1: Check Python ──
    console.print("[bold]1/6[/] Checking Python environment...", end=" ")
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
    if sys.version_info >= (3, 12):
        console.print(f"[green]Python {py_ver} ✓[/]")
    else:
        console.print(f"[red]Python {py_ver} — need 3.12+[/]")
        return

    # ── Step 2: Detect Docker ──
    console.print("[bold]2/6[/] Checking Docker...", end=" ")
    docker_ok = False
    try:
        result = subprocess.run(["docker", "ps"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            docker_ok = True
            console.print("[green]Docker running ✓[/]")
        else:
            console.print("[yellow]Docker installed but not running[/]")
    except FileNotFoundError:
        console.print("[red]Docker not found[/]")
    except Exception:
        console.print("[red]Docker unreachable[/]")

    if not docker_ok:
        console.print("\n[yellow]Docker is required for PostgreSQL + Neo4j.[/]")
        console.print("[dim]Install: https://docs.docker.com/get-docker/[/]")
        if not non_interactive:
            if not click.confirm("Continue without Docker? (databases won't start)", default=False):
                return

    # ── Step 3: API Key ──
    console.print("[bold]3/6[/] Configuring API key...")

    # Try to detect from environment / config
    detected_key = api_key or os.environ.get("DASHSCOPE_API_KEY", "")
    if not detected_key or not detected_key.startswith("sk-"):
        # Try Hermes config
        hc = Path.home() / ".hermes" / "config.yaml"
        if hc.exists():
            try:
                with open(hc) as f:
                    hcfg = yaml.safe_load(f)
                providers = hcfg.get("custom_providers", [])
                if isinstance(providers, dict):
                    providers = list(providers.values())
                for p in providers:
                    if isinstance(p, dict) and "dashscope" in p.get("base_url", ""):
                        detected_key = p.get("api_key", "")
                        break
            except Exception:
                pass

    if detected_key and detected_key.startswith("sk-"):
        masked = detected_key[:10] + "..." + detected_key[-4:]
        console.print(f"  [green]Found: {masked} (from {'env' if api_key or os.environ.get('DASHSCOPE_API_KEY') else 'Hermes config'})[/]")
    elif non_interactive:
        console.print("  [yellow]No API key found. Set DASHSCOPE_API_KEY env var.[/]")
        detected_key = ""
    else:
        console.print("  [dim]Get your key: https://dashscope.aliyun.com/[/]")
        detected_key = click.prompt("  Enter DashScope API key", type=str, default="",
                                     show_default=False).strip()
        if not detected_key:
            console.print("  [yellow]Skipped — set DASHSCOPE_API_KEY later.[/]")

    # ── Step 4: Validate LLM connection ──
    console.print("[bold]4/6[/] Validating LLM connection...", end=" ")
    if detected_key and detected_key.startswith("sk-"):
        try:
            import urllib.request, json as _json
            req = urllib.request.Request(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
                headers={"Authorization": f"Bearer {detected_key}"}
            )
            resp = urllib.request.urlopen(req, timeout=10)
            data = _json.loads(resp.read())
            model_count = len(data.get("data", []))
            console.print(f"[green]Connected ({model_count} models available) ✓[/]")
        except Exception as e:
            console.print(f"[red]Failed: {e}[/]")
    else:
        console.print("[yellow]Skipped — no valid API key[/]")

    # ── Step 5: Start databases ──
    console.print("[bold]5/6[/] Starting databases...")
    if docker_ok:
        compose_file = Path("docker-compose.yml")
        if not compose_file.exists():
            compose_file = Path.home() / "deepspace" / "docker-compose.yml"

        if compose_file.exists():
            with console.status("[bold]Starting PostgreSQL + Neo4j containers...[/]"):
                subprocess.run(
                    ["docker", "compose", "-f", str(compose_file), "up", "-d"],
                    capture_output=True, text=True, check=False,
                )

            # Wait for PostgreSQL
            pg_ready = False
            with console.status("[bold]Waiting for PostgreSQL...[/]"):
                for _ in range(30):
                    result = subprocess.run(
                        ["docker", "exec", "deepspace-pg", "pg_isready", "-U", "deepspace"],
                        capture_output=True, text=True,
                    )
                    if result.returncode == 0:
                        pg_ready = True
                        break
                    time.sleep(2)

            console.print(
                f"  PostgreSQL: [{'green]ready ✓' if pg_ready else 'red]timeout'}"
            )

            # Wait for Neo4j
            neo4j_ready = False
            with console.status("[bold]Waiting for Neo4j...[/]"):
                for _ in range(30):
                    result = subprocess.run(
                        ["docker", "exec", "deepspace-neo4j", "cypher-shell",
                         "-u", "neo4j", "-p", "deepspace123", "RETURN 1"],
                        capture_output=True, text=True,
                    )
                    if result.returncode == 0:
                        neo4j_ready = True
                        break
                    time.sleep(2)

            console.print(
                f"  Neo4j:      [{'green]ready ✓' if neo4j_ready else 'red]timeout'}"
            )

            if not pg_ready or not neo4j_ready:
                console.print("[yellow]Some databases may still be starting. Run 'deepspace init' again.[/]")
        else:
            console.print(f"  [yellow]docker-compose.yml not found at {compose_file}[/]")
    else:
        console.print("  [dim]Skipped — Docker not available[/]")

    # ── Step 6: Init schema ──
    console.print("[bold]6/6[/] Initializing database schema...", end=" ")
    try:
        async def _init_schema():
            config = load_config(ctx.obj.get("config_path", "config/config.yaml"))
            store = await create_store(config)
            await store.init_schema()
        asyncio.run(_init_schema())
        console.print("[green]Ready ✓[/]")
    except Exception as e:
        console.print(f"[yellow]Failed: {e}[/]")
        console.print("[dim]Databases may not be ready yet. Run 'deepspace init' again.[/]")

    # ── Done ──
    console.print()
    console.print(Panel.fit(
        "[bold green]DeepSpace is ready![/]\n\n"
        "Try these commands:\n"
        "  deepspace remember \"Hello DeepSpace\"\n"
        "  deepspace recall \"Hello\"\n"
        "  deepspace solve \"check system status\" -m plan_only\n"
        "  deepspace serve\n\n"
        f"[dim]Docs: https://windriders.github.io/opendeepspace/[/]",
        title="  Setup Complete",
        border_style="green",
    ))


@cli.command()
@click.pass_context
def predict(ctx):
    """Predict what the user will need next."""
    from core.proactive_service import ProactiveService

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        proactive = ProactiveService(engine, engine.llm, config)

        with console.status("[bold blue]Analyzing context and predicting needs...[/]"):
            context = await proactive.detect_context()
            predictions = await proactive.predict_needs()

        console.print(Panel(
            context.get("current_focus", "No active focus detected"),
            title="Current Context"
        ))

        if predictions:
            console.print("\n[bold]Predicted Needs:[/]")
            for i, p in enumerate(predictions, 1):
                relevance_bar = "█" * int(p.get("relevance", 0) * 10) + "░" * (10 - int(p.get("relevance", 0) * 10))
                console.print(
                    f"\n[bold]{i}.[/] {p.get('type', 'unknown')} "
                    f"[dim](relevance: {relevance_bar} {p.get('relevance', 0):.1f})[/]"
                )
                console.print(f"   [cyan]Topic:[/] {p.get('topic', '')}")
                console.print(f"   [yellow]Action:[/] {p.get('action', '')}")
        else:
            console.print("[yellow]No predictions generated.[/]")

    asyncio.run(_run())


@cli.command()
@click.pass_context
def push(ctx):
    """Run a proactive push cycle."""
    from core.proactive_service import ProactiveService

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        proactive = ProactiveService(engine, engine.llm, config)

        message = await proactive.push()
        if message:
            console.print(Panel(message, title="  Push Notification"))
        else:
            console.print("[yellow]No push triggered (cooldown/limit/no high-confidence predictions).[/]")

    asyncio.run(_run())


@cli.command()
@click.pass_context
def briefing(ctx):
    """Generate a daily briefing."""
    from core.proactive_service import ProactiveService

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        proactive = ProactiveService(engine, engine.llm, config)

        with console.status("[bold blue]Generating daily briefing...[/]"):
            briefing_text = await proactive.daily_briefing()

        console.print(Panel(briefing_text, title="  DeepSpace Daily Briefing"))

    asyncio.run(_run())


@cli.command()
@click.option("--once", "-1", is_flag=True, help="Run one cycle and exit")
@click.option("--consolidate-interval", default=60, help="Consolidation interval (min)")
@click.option("--learn-interval", default=15, help="Learning interval (min)")
@click.option("--proactive-interval", default=10, help="Proactive interval (min)")
@click.pass_context
def orchestrate(ctx, once, consolidate_interval, learn_interval, proactive_interval):
    """Run the full multi-agent orchestrator."""
    from core.orchestrator import Orchestrator

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        orch = Orchestrator(engine, engine.llm, config)

        if once:
            with console.status("[bold blue]Running orchestration cycle...[/]"):
                result = await orch.run_full_cycle()

            # Display results
            cons = result.get("consolidation", {})
            console.print(f"\n[bold]Consolidation:[/] {cons.get('promoted_to_working', 0)}→working, "
                         f"{cons.get('promoted_to_long_term', 0)}→long-term, "
                         f"{cons.get('forgotten', 0)} forgotten")

            learn = result.get("learning", {})
            console.print(f"[bold]Learning:[/] {learn.get('status', 'unknown')} "
                         f"{'— ' + learn.get('task', '') if learn.get('task') else ''}")

            proactive = result.get("proactive", {})
            console.print(f"[bold]Proactive:[/] {'Pushed' if proactive.get('pushed') else 'Not pushed'}")

            ref = result.get("reflection", {})
            if ref.get("gaps"):
                console.print(f"\n[bold yellow]Top Knowledge Gaps:[/]")
                for g in ref["gaps"][:3]:
                    console.print(f"  • {g['topic']}")
        else:
            console.print(f"[bold]Starting orchestrator[/] (consolidate:{consolidate_interval}m "
                         f"learn:{learn_interval}m proactive:{proactive_interval}m)")
            console.print("[dim]Press Ctrl+C to stop.[/]")
            try:
                await orch.run_loop(
                    consolidate_interval=consolidate_interval,
                    learn_interval=learn_interval,
                    proactive_interval=proactive_interval,
                )
            except KeyboardInterrupt:
                orch.stop()
                console.print("\n[green]Orchestrator stopped.[/]")

    asyncio.run(_run())


@cli.command()
@click.argument("goal")
@click.option("--context", "-c", default="", help="Additional context or constraints")
@click.option("--mode", "-m", type=click.Choice(["plan_only", "step_by_step", "semi_auto", "full_auto"]),
              default="semi_auto", help="Execution mode")
@click.pass_context
def solve(ctx, goal, context, mode):
    """Autonomous problem-solving: Goal -> Plan -> Execute -> Verify -> Learn.

    GOAL is a description of what you want to achieve in natural language.\n
    Examples:
      deepspace solve "find all Python files modified in the last 7 days"
      deepspace solve "check if deepspace-pg container is running" -m plan_only
      deepspace solve "run pytest and show failing tests" -c "workdir: ~/deepspace"
    """
    from core.orchestrator import Orchestrator
    from core.models import ExecutionMode

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        orch = Orchestrator(engine, engine.llm, config)

        exec_mode = ExecutionMode(mode)

        console.print(f"\n[bold cyan]Goal:[/] {goal}")
        console.print(f"[dim]Mode: {mode} | Context: {context or 'none'}[/]\n")

        # Phase 1 & 2: Goal + Plan
        with console.status("[bold blue]Planning...[/]"):
            plan_result = await orch._agent_planning(goal_description=goal)

        plan = plan_result.get("plan", {})
        steps = plan.get("steps", [])

        if steps:
            table = Table(title="Execution Plan")
            table.add_column("#", style="dim", width=3)
            table.add_column("Action", width=12)
            table.add_column("Description", width=50)
            table.add_column("Command", width=40)

            for i, s in enumerate(steps):
                table.add_row(
                    str(i), s.get("action_type", "shell"),
                    s.get("description", "")[:50],
                    s.get("command", "")[:40],
                )
            console.print(table)
            console.print(f"[dim]Rationale: {plan.get('rationale', 'none')}[/]")
            console.print(f"[dim]Estimated: {plan.get('estimated_total_minutes', 0)} min[/]\n")

        if mode == "plan_only":
            return

        # Phase 3-5: Execute + Verify + Learn
        with console.status("[bold green]Executing...[/]"):
            result = await orch.solve_goal(
                description=goal,
                context=context,
                mode=exec_mode,
            )

        # Display results
        outcome_style = {
            "success": "green", "partial_success": "yellow",
            "failed": "red", "planned_only": "blue",
        }
        style = outcome_style.get(result.get("outcome", "failed"), "red")
        console.print(f"\n[bold {style}]Outcome: {result['outcome']}[/]")

        if result.get("execution"):
            table = Table(title="Execution Results")
            table.add_column("#", style="dim", width=3)
            table.add_column("Description", width=40)
            table.add_column("Status", width=14)
            table.add_column("Duration", width=10)

            for i, exec_entry in enumerate(result["execution"]):
                verify_entry = result.get("verification", [{}])[i] if i < len(result.get("verification", [])) else {}
                passed_mark = " OK" if verify_entry.get("passed") else " !!"

                s_style = {
                    "completed": "green", "failed": "red",
                    "skipped": "dim", "approval_required": "yellow",
                }.get(exec_entry.get("status", "failed"), "red")

                table.add_row(
                    str(exec_entry["step"]),
                    exec_entry.get("description", "")[:40],
                    f"[{s_style}]{exec_entry.get('status', '?')}{passed_mark}[/]",
                    f"{exec_entry.get('duration_seconds', 0):.1f}s",
                )
            console.print(table)

        console.print(f"\n[dim]Outcome recorded in memory for future planning.[/]")

    asyncio.run(_run())


@cli.command()
@click.option("--max-goals", "-n", default=2, help="Max self-derived goals to solve")
@click.pass_context
def auto_solve(ctx, max_goals):
    """Derive and autonomously solve goals from knowledge gaps."""
    from core.orchestrator import Orchestrator

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        orch = Orchestrator(engine, engine.llm, config)

        console.print(f"[bold]Auto-Solve:[/] Finding knowledge gaps to address...\n")

        with console.status("[bold blue]Deriving goals from reflection...[/]"):
            goals = await orch.derive_goals(max_goals=max_goals)

        if not goals:
            console.print("[yellow]No high-priority knowledge gaps found.[/]")
            return

        table = Table(title="Self-Derived Goals")
        table.add_column("#", style="dim", width=3)
        table.add_column("Topic", width=30)
        table.add_column("Priority", width=10)
        table.add_column("Reason", width=50)

        for i, g in enumerate(goals):
            table.add_row(
                str(i), g.get("topic", "")[:30],
                f"{g.get('priority', 0):.2f}",
                g.get("context", "")[:50],
            )
        console.print(table)

        with console.status("[bold green]Auto-solving...[/]"):
            results = await orch.solve_self_derived_goals(max_goals=max_goals)

        console.print(f"\n[bold]Auto-Solve Results:[/]")
        for r in results:
            outcome_style = {"success": "green", "partial_success": "yellow",
                             "failed": "red", "error": "red"}
            style = outcome_style.get(r.get("outcome", "failed"), "red")
            console.print(
                f"  [{style}]{r['outcome']}[/] — {r.get('goal', '')[:60]} "
                f"({r.get('steps', 0)} steps)"
            )
        console.print(f"\n[dim]Results stored in memory for future use.[/]")

    asyncio.run(_run())


@cli.command()
@click.option("--limit", "-n", default=10)
@click.pass_context
def executions(ctx, limit):
    """Show autonomous execution history."""
    from core.orchestrator import Orchestrator

    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        orch = Orchestrator(engine, engine.llm, config)

        history = orch.execution_history[-limit:]

        if not history:
            console.print("[yellow]No execution history yet.[/]")
            return

        table = Table(title=f"Execution History (last {len(history)})")
        table.add_column("#", style="dim", width=3)
        table.add_column("Goal", width=50)
        table.add_column("Outcome", width=16)
        table.add_column("Steps", width=8)
        table.add_column("Time")

        for i, entry in enumerate(reversed(history)):
            outcome_style = {"success": "green", "partial_success": "yellow",
                             "failed": "red", "planned_only": "blue"}
            style = outcome_style.get(entry.get("outcome", "failed"), "red")
            table.add_row(
                str(i + 1),
                entry.get("goal", "")[:50],
                f"[{style}]{entry.get('outcome', '?')}[/]",
                f"{entry.get('steps_passed', 0)}/{entry.get('steps_total', 0)}",
                entry.get("timestamp", "")[:19],
            )
        console.print(table)

    asyncio.run(_run())


@cli.command()
@click.option("--threshold", "-t", default=0.85, type=float, help="Similarity threshold (0.0-1.0)")
@click.option("--dry-run", is_flag=True, help="Preview without merging")
@click.pass_context
def dedup(ctx, threshold, dry_run):
    """Find and merge semantically duplicate memories using LLM similarity."""
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        with console.status("[bold]Scanning for duplicate memories...[/]"):
            result = await engine.deduplicate(threshold=threshold, dry_run=dry_run)

        if ctx.obj.get("json_output"):
            console.print_json(json.dumps(result, default=str))
            return

        console.print(f"\n[bold]Dedup:[/] Checked {result['checked']}, merged {result['merged']}")
        if result.get("pairs"):
            for i, p in enumerate(result["pairs"][:10]):
                console.print(f"  {i+1}. {p['content_a'][:60]}  ~{p['similarity']:.2f}")
            if dry_run: console.print("[yellow]Dry run — no changes[/]")

    asyncio.run(_run())


@cli.command()
@click.argument("output_path", type=click.Path())
@click.option("--format", "-f", "fmt", type=click.Choice(["json", "markdown", "md"]),
              default="json", help="Export format")
@click.option("--layer", "-l", type=click.Choice([l.value for l in MemoryLayer]),
              default=None, help="Filter by layer")
@click.option("--project", "-p", default=None, help="Filter by project")
@click.option("--limit", "-n", default=1000, help="Max memories to export")
@click.pass_context
def export(ctx, output_path, fmt, layer, project, limit):
    """Export memories to a file.

    Examples:
      deepspace export memories.json
      deepspace export memories.md -f markdown
      deepspace export project.json -p timemap
    """
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        # Fetch memories
        all_memories = []
        layer_filter = MemoryLayer(layer) if layer else None
        if layer_filter:
            memories = await engine.vector_store.get_by_layer(layer_filter, limit=limit)
            all_memories = memories
        else:
            for l in MemoryLayer:
                memories = await engine.vector_store.get_by_layer(l, limit=limit // 4)
                all_memories.extend(memories)

        # Filter by project
        if project:
            all_memories = [m for m in all_memories if m.project == project]

        all_memories = all_memories[:limit]
        console.print(f"[bold]Exporting {len(all_memories)} memories...[/]")

        out_path = Path(output_path)
        if fmt in ("markdown", "md"):
            lines = [f"# DeepSpace Memory Export\n",
                     f"Exported: {now_utc().isoformat()}\n",
                     f"Count: {len(all_memories)}\n\n"]
            for m in all_memories:
                lines.append(f"## [{m.layer.value}] {m.memory_type.value} — importance: {m.importance:.2f}\n")
                lines.append(f"{m.content}\n")
                if m.tags:
                    lines.append(f"Tags: {', '.join(m.tags)}\n")
                lines.append("---\n\n")
            out_path.write_text("\n".join(lines))
        else:
            import json as _json
            data = {
                "exported_at": now_utc().isoformat(),
                "version": VERSION,
                "count": len(all_memories),
                "memories": [m.model_dump() for m in all_memories],
            }
            # Convert datetime
            for mem in data["memories"]:
                if "created_at" in mem and hasattr(mem["created_at"], "isoformat"):
                    mem["created_at"] = mem["created_at"].isoformat()
                if "last_accessed" in mem and hasattr(mem["last_accessed"], "isoformat"):
                    mem["last_accessed"] = mem["last_accessed"].isoformat()
            out_path.write_text(_json.dumps(data, ensure_ascii=False, indent=2, default=str))

        console.print(f"[green]Exported to {out_path.resolve()}[/]")

    import json as _json
    from core.models import now_utc
    asyncio.run(_run())


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--dry-run", is_flag=True, help="Preview without importing")
@click.pass_context
def import_memories(ctx, file_path, dry_run):
    """Import memories from a JSON or Markdown file.

    Supports files exported by 'deepspace export'.

    Examples:
      deepspace import-memories memories.json
      deepspace import-memories memories.md --dry-run
    """
    async def _run():
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)

        path = Path(file_path)
        content = path.read_text()

        memories_to_import = []

        if path.suffix in (".json",):
            import json as _json
            data = _json.loads(content)
            raw_memories = data.get("memories", [])
            console.print(f"[bold]Found {len(raw_memories)} memories in JSON file[/]")
            for raw in raw_memories:
                try:
                    mem = Memory(
                        content=raw.get("content", ""),
                        summary=raw.get("summary", ""),
                        layer=MemoryLayer(raw.get("layer", "short_term")),
                        memory_type=MemoryType(raw.get("memory_type", "fact")),
                        importance=float(raw.get("importance", 0.5)),
                        project=raw.get("project", ""),
                        tags=raw.get("tags", []),
                        source="import",
                    )
                    memories_to_import.append(mem)
                except Exception as e:
                    console.print(f"[yellow]Skipped invalid memory: {e}[/]")
        elif path.suffix == ".md" or path.suffix == ".markdown":
            # Simple markdown parser: split by ## headers
            import re
            sections = re.split(r'\n## ', content)
            for section in sections[1:]:
                lines = section.strip().split('\n')
                if not lines:
                    continue
                header = lines[0].strip()
                body_lines = []
                for l in lines[1:]:
                    if l.startswith('Tags:') or l.startswith('---'):
                        break
                    body_lines.append(l)
                body = '\n'.join(body_lines).strip()
                if body:
                    memories_to_import.append(Memory(content=body, source="import"))
            console.print(f"[bold]Found {len(memories_to_import)} memories in Markdown file[/]")
        else:
            console.print(f"[red]Unsupported format: {path.suffix}[/]")
            return

        if dry_run:
            console.print(f"\n[bold]Dry run — would import {len(memories_to_import)} memories:[/]")
            for i, m in enumerate(memories_to_import[:10]):
                console.print(f"  {i+1}. {m.content[:80]}...")
            if len(memories_to_import) > 10:
                console.print(f"  ... and {len(memories_to_import) - 10} more")
            return

        imported = 0
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
            task = progress.add_task("Importing memories...", total=len(memories_to_import))
            for mem in memories_to_import:
                try:
                    await engine.remember(
                        content=mem.content,
                        layer=mem.layer,
                        memory_type=mem.memory_type,
                        project=mem.project,
                        tags=mem.tags,
                        source="import",
                        auto_summarize=False,
                        auto_embed=True,
                        auto_graph=(imported % 5 == 0),
                    )
                    imported += 1
                except Exception as e:
                    console.print(f"[yellow]Import failed for: {mem.content[:40]}... — {e}[/]")
                progress.update(task, advance=1)

        console.print(f"\n[green]Imported {imported}/{len(memories_to_import)} memories[/]")

    from core.models import Memory, now_utc
    asyncio.run(_run())


@cli.command()
@click.option("--follow", "-f", is_flag=True, help="Follow log output (tail -f)")
@click.option("--lines", "-n", default=50, help="Number of lines to show")
@click.option("--level", "-l", default="INFO", help="Filter by level: DEBUG, INFO, WARNING, ERROR")
@click.pass_context
def logs(ctx, follow, lines, level):
    """View DeepSpace logs with optional live tail.

    Examples:
      deepspace logs           # Show last 50 lines
      deepspace logs -f        # Follow live
      deepspace logs -f -l DEBUG
      deepspace logs -n 200
    """
    log_path = Path("data/deepspace.log")
    if not log_path.exists():
        log_path = Path.home() / "deepspace" / "data" / "deepspace.log"

    if not log_path.exists():
        console.print("[yellow]No log file found. DeepSpace may not have been started yet.[/]")
        console.print("[dim]Start with: deepspace serve  or  deepspace orchestrate[/]")
        return

    levels_order = {"DEBUG": 0, "INFO": 1, "WARNING": 2, "ERROR": 3}
    min_level = levels_order.get(level.upper(), 1)

    def should_show(line: str) -> bool:
        if level.upper() == "DEBUG":
            return True
        for lv_name, lv_val in levels_order.items():
            if lv_name in line and lv_val >= min_level:
                return True
        # If no level marker, show it (could be a continuation line)
        return not any(f"{name}" in line for name in levels_order)

    def style_line(line: str) -> str:
        if "ERROR" in line:
            return f"[red]{line}[/]"
        elif "WARNING" in line:
            return f"[yellow]{line}[/]"
        elif "DEBUG" in line:
            return f"[dim]{line}[/]"
        return line

    if follow:
        console.print(f"[bold]Following {log_path} (Ctrl+C to stop)[/]")
        try:
            with open(log_path) as f:
                f.seek(0, 2)  # End of file
                import time
                while True:
                    new_line = f.readline()
                    if new_line:
                        if should_show(new_line):
                            console.print(style_line(new_line.rstrip()))
                    else:
                        time.sleep(0.5)
        except KeyboardInterrupt:
            console.print("\n[dim]Stopped[/]")
    else:
        # Just show last N lines
        all_lines = log_path.read_text().split('\n')
        filtered = [l for l in all_lines if l.strip() and should_show(l)]
        shown = filtered[-lines:]

        console.print(f"[bold]Last {len(shown)} log entries from {log_path}[/]")
        console.print(f"[dim]Level filter: {level} | Use -f to follow live[/]\n")
        for line in shown:
            console.print(style_line(line))


@cli.command()
@click.option("--days", "-d", default=30, help="Days to include")
@click.option("--project", "-p", default=None, help="Filter by project")
@click.pass_context
def timeline(ctx, days, project):
    """View a chronological timeline of memories and executions."""
    async def _run():
        from core.timeline import TimelineGenerator
        config = load_config(ctx.obj["config_path"])
        engine = await init_engine(config)
        gen = TimelineGenerator(engine)
        json_out = ctx.obj.get("json_output")

        result = await gen.get_project_timeline(project, days) if project else await gen.get_full_timeline(days)

        if json_out:
            console.print_json(json.dumps(result, default=str))
            return

        console.print(f"\n[bold]Timeline:[/] {result.get('days',0)} days, {result.get('total_events',0)} events")
        if project:
            console.print(f"Project: {project} | {result.get('first_activity','')} → {result.get('last_activity','')}")
            for ms in (result.get('milestones') or [])[:5]:
                console.print(f"  • {ms['date'][:10]} [{ms['importance']:.2f}] {ms['title'][:80]}")

        for day in (result.get('timeline') or [])[:14]:
            m = day.get('memories',0); e = day.get('executions',0)
            bar = '█' * min(m, 15) + ('▒' * min(e, 8))
            console.print(f"  {day['date']}  [dim]{bar}[/] ({m}m, {e}e)")

    asyncio.run(_run())


@cli.command()
@click.argument("action", type=click.Choice(["list", "enable", "disable", "reload"]))
@click.argument("plugin_name", required=False)
@click.pass_context
def plugins(ctx, action, plugin_name):
    """Manage DeepSpace plugins."""
    from core.plugin_manager import PluginManager
    import asyncio as _asyncio

    manager = PluginManager()
    if action == "list":
        manifests = _asyncio.run(manager.discover())
        if not manifests:
            console.print("[yellow]No plugins found.[/]\n[dim]Create: plugins/<name>/plugin.json[/]")
            return
        table = Table(title="Plugins")
        table.add_column("Name"); table.add_column("Version"); table.add_column("Description"); table.add_column("Provides")
        for m in manifests: table.add_row(m.name, m.version, m.description[:40], ", ".join(m.provides[:3]))
        console.print(table)
    elif action == "reload":
        with console.status("[bold]Reloading plugins...[/]"):
            _asyncio.run(manager.load_all()); _asyncio.run(manager.enable_all())
        console.print(f"[green]Loaded {len(manager.plugins)} plugin(s)[/]")
    elif action == "enable":
        _asyncio.run(manager.load_all())
        ok = _asyncio.run(manager.enable_plugin(plugin_name)) if plugin_name else True
        console.print(f"[{'green]Enabled' if ok else 'red]Not found'}[/]")
    elif action == "disable":
        ok = _asyncio.run(manager.disable_plugin(plugin_name)) if plugin_name else True
        console.print(f"[green]Disabled[/]")


@cli.command()
@click.pass_context
def model_status(ctx):
    """Show model router health and provider status."""
    from core.model_router import ModelRouter
    config = load_config(ctx.obj["config_path"])
    router = ModelRouter(config)
    st = router.status
    if ctx.obj.get("json_output"):
        console.print_json(json.dumps(st))
        return
    console.print(f"[bold]Model Status:[/] {st['healthy_providers']}/{st['total_providers']} healthy")
    for p in st["providers"]:
        h = "[green]OK[/]" if p["healthy"] else "[red]DOWN[/]"
        console.print(f"  {p['name']}: {h}  fail_rate={p['failure_rate']:.2%}  calls={p['total_calls']}")


@cli.command()
@click.option("--port", "-p", default=8645, help="API server port")
@click.option("--host", "-h", default="127.0.0.1", help="API server host")
@click.pass_context
def serve(ctx, port, host):
    """Start the FastAPI + WebSocket server."""
    import uvicorn
    console.print(f"[bold green]Starting DeepSpace API server on {host}:{port}[/]")
    console.print("[dim]Endpoints: /remember /recall /stats /reflect /graph/search /ws[/]")
    console.print("[dim]Press Ctrl+C to stop.[/]")
    uvicorn.run("api.server:app", host=host, port=port, reload=False, log_level="info")


@cli.command()
@click.pass_context
def completion(ctx):
    """Generate shell completion scripts for bash/zsh/fish.

    Usage:
      # Bash (add to ~/.bashrc):
      eval "$(deepspace completion)"

      # Zsh (add to ~/.zshrc):
      eval "$(deepspace completion)"

      # Fish (add to ~/.config/fish/config.fish):
      deepspace completion | source

    Or auto-install to system paths:
      deepspace completion > ~/.local/share/bash-completion/completions/deepspace
    """
    import os
    shell = os.environ.get("SHELL", "/bin/bash")

    if "zsh" in shell:
        from click.shell_completion import ZshComplete
        comp = ZshComplete(cli, {}, "deepspace", "_DEEP_SPACE_COMPLETE")
    elif "fish" in shell:
        from click.shell_completion import FishComplete
        comp = FishComplete(cli, {}, "deepspace", "_DEEP_SPACE_COMPLETE")
    else:
        from click.shell_completion import BashComplete
        comp = BashComplete(cli, {}, "deepspace", "_DEEP_SPACE_COMPLETE")

    console.print(comp.source())


@cli.command()
@click.pass_context
def schedule(ctx):
    """Set up Hermes cronjobs for DeepSpace automation."""
    from integrations.hermes_bridge import HermesBridge

    config = load_config(ctx.obj["config_path"])
    bridge = HermesBridge(config)

    if not bridge.enabled:
        console.print("[red]Hermes bridge is disabled in config.[/]")
        return

    console.print("[bold]Setting up DeepSpace cronjobs via Hermes...[/]\n")

    results = bridge.setup_all_schedules()
    for name, status in results.items():
        icon = "[green]✓[/]" if status == "created" else "[red]✗[/]"
        console.print(f"  {icon} {name}: {status}")

    console.print("\n[dim]Use 'hermes cronjob list' to verify.[/]")


def main():
    """Entry point."""
    cli()


if __name__ == "__main__":
    main()