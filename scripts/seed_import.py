"""
Batch import script — feed DeepSpace with existing project context.
Run once to seed the memory engine.
"""
import asyncio, sys, os, re, yaml
from pathlib import Path

sys.path.insert(0, str(Path.home() / "deepspace"))

from core.llm_client import LLMClient
from core.memory_engine import MemoryEngine
from core.models import MemoryLayer, MemoryType
from storage.pgvector_store import create_store
from storage.neo4j_store import create_graph_store


def load_config():
    path = Path.home() / "deepspace" / "config" / "config.yaml"
    with open(path) as f:
        raw = f.read()
    def expand_env(m):
        return os.environ.get(m.group(1), "")
    raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)
    cfg = yaml.safe_load(raw)

    # Fallback from Hermes config
    if not cfg.get("llm", {}).get("api_key", "").startswith("sk-"):
        hc = Path.home() / ".hermes" / "config.yaml"
        if hc.exists():
            with open(hc) as f:
                hcfg = yaml.safe_load(f)
            providers = hcfg.get("custom_providers", [])
            if isinstance(providers, dict):
                providers = list(providers.values())
            for p in providers:
                if isinstance(p, dict) and "dashscope" in p.get("base_url", ""):
                    cfg["llm"]["api_key"] = p.get("api_key", "")
                    break
    return cfg


async def main():
    config = load_config()
    print("Initializing engine...")
    llm = LLMClient(config)
    store = await create_store(config)
    graph = await create_graph_store(config)
    engine = MemoryEngine(llm, store, graph, config)
    print("Engine ready.\n")

    # ── Memories to import ──────────────────
    memories = [
        # ── Hermes Agent ──
        {
            "content": "Hermes Agent 是一个 CLI AI Agent，运行在 macOS 上，主目录 ~/.hermes/，通过 DashScope API (dashscope.aliyuncs.com) 调用 deepseek-v4-pro 和 qwen-vl-max-latest 模型",
            "project": "hermes-agent",
            "tags": ["architecture", "overview"],
        },
        {
            "content": "Hermes 使用 custom_providers 配置多个模型提供商：ds-v4 (deepseek-v4-pro) 用于推理/代码，qwen-vl-max (qwen-vl-max-latest) 用于视觉，所有辅助模型（vision, compression, session_search, approval）均使用 DashScope",
            "project": "hermes-agent",
            "tags": ["configuration", "providers"],
        },
        {
            "content": "Hermes 的 cronjob 功能支持定时任务，模型参数覆盖（model parameter override），仅在 Gateway 运行时触发。cronjob 可以设置 script、no_agent、context_from 等高级参数",
            "project": "hermes-agent",
            "tags": ["cronjob", "scheduling"],
        },
        {
            "content": "Hermes 配置文件在 ~/.hermes/config.yaml，approvals 模式设为 smart，secrets redaction 已启用，browser/computer_use/code_execution 工具均已开启",
            "project": "hermes-agent",
            "tags": ["configuration", "security"],
        },
        {
            "content": "Hermes 有两个 profile：writer（创意角色，deepseek-v4-pro）和 dev（技术角色，deepseek-v4-pro），配置文件在 ~/.hermes/profiles/，对应的 CLI 为 writer 和 dev",
            "project": "hermes-agent",
            "tags": ["profiles", "customization"],
        },
        {
            "content": "Hermes 安装了可选 skills：duckduckgo-search, rest-graphql-debug, domain-intel, sherlock, canvas。Webhook 已启用，端口 8644，带 HMAC secret",
            "project": "hermes-agent",
            "tags": ["skills", "webhook"],
        },

        # ── TimeMap ──
        {
            "content": "TimeMap 是一个基于 Next.js 16 + Turbopack + pnpm monorepo 的历史知识引擎，包含交互式地图、时间线和知识图谱功能，活跃开发目录在 ~/TimeMap_big",
            "project": "timemap",
            "tags": ["overview", "architecture"],
        },
        {
            "content": "TimeMap 使用多个 PostgreSQL Docker 容器：timemap-postgres-db 在端口 5438（主数据库），timemap_db 在 5432，timemap-db 也在 5432。通过 docker ps 检查端口映射。使用 Prisma ORM",
            "project": "timemap",
            "tags": ["database", "docker"],
        },
        {
            "content": "TimeMap 开发环境需要 Node >= 20.9.0，默认 nvm alias 是 v24.11.1，但 Terminal.app 会话可能从 v18.12.1 启动，需要先 source ~/.nvm/nvm.sh && nvm use 24",
            "project": "timemap",
            "tags": ["environment", "nodejs", "nvm"],
        },
        {
            "content": "TimeMap 使用 Meilisearch 做全文搜索，Docker 容器 timemap-search 运行在端口 7700。还有后端服务 backend-sbti-backend-1 在端口 9989",
            "project": "timemap",
            "tags": ["search", "docker"],
        },

        # ── DeepSpace ──
        {
            "content": "DeepSpace 是一个基于 LLM/Agent 的自主学习记忆系统，四层记忆模型（short_term → working → long_term ← meta），使用 Neo4j 做知识图谱，PostgreSQL+pgvector 做向量存储",
            "project": "deepspace",
            "tags": ["architecture", "overview"],
        },
        {
            "content": "DeepSpace 的 Docker 基础设施：deepspace-pg (pgvector/pg16, 端口5440) 和 deepspace-neo4j (neo4j:5-community, 端口7474/7687)，密码 deepspace/deepspace123",
            "project": "deepspace",
            "tags": ["docker", "infrastructure"],
        },

        # ── Workflows & Preferences ──
        {
            "content": "用户偏好中文（Chinese）沟通，主要从事两个方向：技术开发（AI Agent、Web 应用）和创意写作（小说/中篇），使用 macOS 15.7.3，Terminal.app 终端",
            "project": "",
            "tags": ["preferences", "user"],
        },
        {
            "content": "用户的核心 API 提供商是阿里云 DashScope (dashscope.aliyuncs.com/compatible-mode/v1)，使用 deepseek-v4-pro 处理推理和代码，qwen-vl-max-latest 处理视觉，qwen-image-2.0-pro 生成图像",
            "project": "",
            "tags": ["api", "llm", "preferences"],
        },
        {
            "content": "用户有多项目并行的习惯，当前活跃项目包括：TimeMap（历史知识引擎）、Hermes Agent（AI助手配置）、DeepSpace（记忆系统）。所有项目使用 Docker 管理服务",
            "project": "",
            "tags": ["workflow", "projects"],
        },
        {
            "content": "用户的 Yellow ANSI 颜色在 Terminal.app 中存在可见性问题，需要注意避免使用黄色做关键信息展示",
            "project": "",
            "tags": ["environment", "terminal", "accessibility"],
        },
        {
            "content": "TimeMap 项目代码更新通过 git pull 从 GitHub upstream 获取。Hermes Agent 也通过 GitHub upstream 保持更新。两个项目都是活跃开发中",
            "project": "",
            "tags": ["git", "workflow"],
        },

        # ── Technical Decisions ──
        {
            "content": "在 DeepSpace 开发中，Neo4j Community Edition 不支持 NODE KEY 约束，需要使用 UNIQUE 约束替代。APOC 插件的 coll.union 可能不可用，ON MATCH SET 需改用简单 CASE WHEN",
            "project": "deepspace",
            "tags": ["neo4j", "pitfalls", "technical-decision"],
        },
        {
            "content": "pgvector 的 embedding 列在通过 psycopg2 RealDictCursor 读取时返回字符串格式（如 '[-0.001, 0.002, ...]'），需要用 strip/split 解析为 float 列表。psycopg2 的 % 占位符与 SQL 的 % 运算符冲突，需用 similarity() 函数替代",
            "project": "deepspace",
            "tags": ["pgvector", "pitfalls", "technical-decision"],
        },
        {
            "content": "Neo4j Python driver 6.x 中 AsyncResult.fetch() 需要传入 n 参数指定返回数量，与 5.x 的 fetch() 不兼容。DateTime 类型需通过 to_native() 转换为 Python datetime",
            "project": "deepspace",
            "tags": ["neo4j", "api-change", "pitfalls"],
        },
    ]

    imported = 0
    for i, mem in enumerate(memories):
        try:
            # Skip LLM calls for simple imports — classify ourselves
            memory = await engine.remember(
                content=mem["content"],
                project=mem.get("project", ""),
                tags=mem.get("tags", []),
                source="batch-import",
                auto_summarize=False,  # Skip for speed
                auto_embed=True,
                auto_graph=(i % 3 == 0),  # Only every 3rd for speed
            )
            imported += 1
            print(f"  [{imported}/{len(memories)}] {memory.layer.value}: {mem['content'][:60]}...")
        except Exception as e:
            print(f"  [ERROR] {mem['content'][:40]}... => {e}")

    print(f"\nImported {imported}/{len(memories)} memories.")
    stats = await engine.stats()
    print(f"Total memories: {stats}")


if __name__ == "__main__":
    asyncio.run(main())