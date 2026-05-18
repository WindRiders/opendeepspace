"""
Fast batch import — skip LLM calls, focus on raw storage.
Consolidation will handle embeddings and graph extraction later.
"""
import asyncio, sys, os, re, yaml, json
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path.home() / "deepspace"))

from core.models import Memory, MemoryLayer, MemoryType, now_utc, new_id
from storage.pgvector_store import PgVectorStore


def load_config():
    path = Path.home() / "deepspace" / "config" / "config.yaml"
    with open(path) as f:
        raw = f.read()
    def expand_env(m):
        return os.environ.get(m.group(1), "")
    raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)
    return yaml.safe_load(raw)


MEMORIES = [
    # Hermes Agent
    ("Hermes Agent 是一个 CLI AI Agent，运行在 macOS 上，通过 DashScope API 调用模型，配置在 ~/.hermes/config.yaml", "hermes-agent", [], MemoryType.FACT, 0.8),
    ("Hermes 使用 custom_providers 配置多个模型：ds-v4 用于推理/代码，qwen-vl-max 用于视觉，所有辅助模型均使用 DashScope", "hermes-agent", ["configuration"], MemoryType.DECISION, 0.7),
    ("Hermes cronjob 功能仅在 Gateway 运行时触发，支持 script、no_agent、context_from 等参数，以及 model parameter override", "hermes-agent", ["cronjob"], MemoryType.WORKFLOW, 0.6),
    ("Hermes 有两个 profile：writer（创意）和 dev（技术），均使用 deepseek-v4-pro，配置文件在 ~/.hermes/profiles/", "hermes-agent", ["profiles"], MemoryType.FACT, 0.6),
    ("Hermes 已安装可选 skills：duckduckgo-search, rest-graphql-debug, domain-intel, sherlock, canvas", "hermes-agent", ["skills"], MemoryType.FACT, 0.5),
    ("Hermes webhook 已启用在端口 8644，带 HMAC secret；Gateway 已安装用于 cronjob 调度", "hermes-agent", ["webhook"], MemoryType.FACT, 0.6),
    ("Hermes 的 approvals 模式设为 smart，secrets redaction 已启用，browser/computer_use/code_execution 工具均已开启", "hermes-agent", ["security"], MemoryType.FACT, 0.6),

    # TimeMap
    ("TimeMap 是基于 Next.js 16 + Turbopack + pnpm monorepo 的历史知识引擎，包含交互式地图、时间线和知识图谱，开发目录 ~/TimeMap_big", "timemap", [], MemoryType.FACT, 0.9),
    ("TimeMap 数据库使用 Docker 容器 timemap-postgres-db 在端口 5438，还有一个 timemap_db 在 5432 端口，使用 Prisma ORM", "timemap", ["database"], MemoryType.FACT, 0.8),
    ("TimeMap 开发环境需要 Node >= 20.9.0，默认 nvm alias v24.11.1，但 Terminal.app 可能启动 v18.12.1，需 source ~/.nvm/nvm.sh && nvm use 24", "timemap", ["environment"], MemoryType.COMMAND, 0.7),
    ("TimeMap 使用 Meilisearch 做全文搜索（容器 timemap-search，端口 7700），还有后端 backend-sbti-backend-1 在端口 9989", "timemap", ["search"], MemoryType.FACT, 0.6),

    # DeepSpace
    ("DeepSpace 是自主学习记忆系统，四层记忆模型 (short_term→working→long_term←meta)，Neo4j 做知识图谱，PostgreSQL+pgvector 做向量存储", "deepspace", [], MemoryType.FACT, 0.8),
    ("DeepSpace Docker：deepspace-pg (pgvector, 端口5440) 和 deepspace-neo4j (Neo4j5, 端口7474/7687)，密码 deepspace/deepspace123", "deepspace", ["docker"], MemoryType.FACT, 0.7),
    ("DeepSpace Neo4j Community 不支持 NODE KEY，需用 UNIQUE；APOC 可能不可用；Neo4j driver 6.x fetch() 需 n 参数", "deepspace", ["pitfalls"], MemoryType.BUG_FIX, 0.7),
    ("DeepSpace pgvector embedding 列通过 RealDictCursor 读取返回字符串需手动解析；psycopg2 的 % 与 SQL % 冲突，用 similarity() 替代", "deepspace", ["pitfalls"], MemoryType.BUG_FIX, 0.6),
    ("DeepSpace 的 DashScope API key 需从 ~/.hermes/config.yaml 的 custom_providers 中读取，Hermes 安全机制屏蔽了环境变量", "deepspace", ["pitfalls"], MemoryType.BUG_FIX, 0.5),

    # 用户偏好
    ("用户偏好中文沟通，从事技术开发（AI Agent、Web 应用）和创意写作（小说）两个方向", "", ["preferences"], MemoryType.PREFERENCE, 0.9),
    ("用户使用阿里云 DashScope API，deepseek-v4-pro 处理推理/代码，qwen-vl-max-latest 处理视觉，qwen-image-2.0-pro 生成图像", "", ["api"], MemoryType.PREFERENCE, 0.8),
    ("用户 macOS 15.7.3 上 Terminal.app 中的 Yellow ANSI 颜色存在可见性问题", "", ["environment"], MemoryType.EXPERIENCE, 0.5),
]


async def main():
    config = load_config()
    pg_cfg = config.get("storage", {}).get("postgres", {})
    store = PgVectorStore(
        host=pg_cfg.get("host", "localhost"),
        port=pg_cfg.get("port", 5440),
        database=pg_cfg.get("database", "deepspace"),
        user=pg_cfg.get("user", "deepspace"),
        password=pg_cfg.get("password", "deepspace"),
    )

    imported = 0
    for content, project, tags, mtype, importance in MEMORIES:
        mem = Memory(
            content=content,
            summary=content[:200],
            layer=MemoryLayer.WORKING,
            memory_type=mtype,
            importance=importance,
            project=project,
            tags=tags,
            source="fast-import",
        )
        await store.save_memory(mem)
        imported += 1
        print(f"  [{imported}/{len(MEMORIES)}] {mtype.value}: {content[:60]}...")

    print(f"\nImported {imported}/{len(MEMORIES)} memories.")

    # Count
    for layer in MemoryLayer:
        mems = await store.get_by_layer(layer, limit=10000)
        print(f"  {layer.value}: {len(mems)}")


if __name__ == "__main__":
    asyncio.run(main())