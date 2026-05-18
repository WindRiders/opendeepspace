#!/usr/bin/env python3
"""
DeepSpace CLI — Autonomous Learning Memory System.
"""

from __future__ import annotations

import asyncio
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

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import MemoryLayer, MemoryType
from storage.pgvector_store import PgVectorStore, create_store
from storage.neo4j_store import Neo4jGraphStore, create_graph_store

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


@click.group()
@click.option("--config", "-c", default="config/config.yaml", help="Config file path")
@click.pass_context
def cli(ctx, config):
    """DeepSpace — Autonomous Learning Memory System."""
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config


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
@click.pass_context
def setup(ctx):
    """Initialize DeepSpace: start Docker services and init DB."""
    console.print("[bold]Setting up DeepSpace...[/]\n")

    # Check Docker
    import subprocess
    result = subprocess.run(["docker", "ps"], capture_output=True, text=True)
    if result.returncode != 0:
        console.print("[red]Docker is not running. Please start Docker first.[/]")
        return

    # Start services
    compose_file = Path.home() / "deepspace" / "docker-compose.yml"
    if compose_file.exists():
        console.print("Starting Docker services...")
        subprocess.run(
            ["docker", "compose", "-f", str(compose_file), "up", "-d"],
            check=True,
        )
        console.print("[green]✓ Docker services started.[/]")
    else:
        console.print(f"[yellow]docker-compose.yml not found at {compose_file}[/]")

    # Wait for PostgreSQL
    console.print("Waiting for PostgreSQL...")
    import time
    for i in range(30):
        result = subprocess.run(
            ["docker", "exec", "deepspace-pg", "pg_isready", "-U", "deepspace"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            console.print("[green]✓ PostgreSQL ready.[/]")
            break
        time.sleep(2)
    else:
        console.print("[red]PostgreSQL not ready after 60s.[/]")

    # Wait for Neo4j
    console.print("Waiting for Neo4j...")
    for i in range(30):
        result = subprocess.run(
            ["docker", "exec", "deepspace-neo4j", "cypher-shell", "-u", "neo4j", "-p", "deepspace123", "RETURN 1"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            console.print("[green]✓ Neo4j ready.[/]")
            break
        time.sleep(2)
    else:
        console.print("[yellow]Neo4j may still be starting. Run 'deepspace setup' again if needed.[/]")

    # Init DB schema
    console.print("Initializing database schema...")
    async def _init_db():
        config = load_config(ctx.obj["config_path"])
        store = await create_store(config)
        await store.init_schema()
    asyncio.run(_init_db())
    console.print("[green]✓ Database schema initialized.[/]")

    console.print("\n[bold green]DeepSpace setup complete![/]")


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