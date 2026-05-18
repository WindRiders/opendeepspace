# DeepSpace

> 一个基于大模型的自主学习记忆系统。四层记忆模型 + 知识图谱 + 自主学习 + 主动预判。

DeepSpace 是一个运行在后台的 AI 记忆引擎。它观察你的工作、构建知识图谱、在空闲时自主学习、预判你的需求并主动推送相关信息。

## 核心理念

传统的笔记和记忆工具是被动的——你必须手动录入、手动检索。DeepSpace 是主动的：

- **观察** — 记录你的工作内容、决策、学习
- **整理** — 将碎片化信息构建成结构化知识图谱
- **学习** — 空闲时自动研究知识空白、跟踪前沿
- **预判** — 在正确的时机推送你需要的答案

## 架构

```
┌────────────────────────────────────────────┐
│              DeepSpace Core                │
│                                            │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Memory    │ │Knowledge  │ │Autonomous  │  │
│  │ Engine    │ │Graph      │ │Learner     │  │
│  │ 四层记忆  │ │知识图谱   │ │自主学习器  │  │
│  └─────┬────┘ └─────┬─────┘ └──────┬─────┘  │
│        │            │              │        │
│  ┌─────┴────────────┴──────────────┴─────┐  │
│  │       Agent Orchestrator              │  │
│  │    (Executive/Research/Memory/Graph   │  │
│  │     Planning/Reflection/Proactive)    │  │
│  └──────────────────┬───────────────────┘  │
│                     │                      │
│  ┌──────────────────┴───────────────────┐  │
│  │       Proactive Service Layer        │  │
│  │  上下文感知 → 预判需求 → 主动推送    │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

## 快速开始

### 前置条件

- Python 3.12+
- Docker

### 1. 克隆并安装

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. 配置 API Key

```bash
export DASHSCOPE_API_KEY="sk-your-key-here"
```

DeepSpace 默认使用阿里云 DashScope（OpenAI 兼容 API）。如需使用其他提供商，编辑 `config/config.yaml` 中的 `llm.base_url` 和 `llm.models`。

### 3. 启动服务

```bash
# 启动数据库 (Docker)
docker compose up -d

# 等待就绪后初始化
deepspace setup
```

### 4. 开始使用

```bash
# 记忆
deepspace remember "我正在开发一个使用 Prisma 的历史数据平台"

# 检索
deepspace recall "Prisma 查询优化"

# 每日简报
deepspace briefing

# 预判需求
deepspace predict

# 知识图谱搜索
deepspace graph "PostgreSQL"

# 查看实体关联
deepspace neighbors "TimeMap"

# 元认知反思
deepspace reflect

# 后台持续运行
deepspace orchestrate
```

## 四层记忆模型

| 层级 | 说明 | 生命周期 |
|------|------|---------|
| **短期记忆** (short_term) | 当前会话上下文 | 分钟~天 |
| **工作记忆** (working) | 项目相关上下文 | 天~周 |
| **长期记忆** (long_term) | 永久知识 | 永久 |
| **元记忆** (meta) | 关于记忆的记忆 | 永久 |

## CLI 命令

```
remember    存储新记忆
recall      混合检索（向量 + 关键词）
show        查看记忆详情
consolidate 记忆巩固（短期→长期）
reflect     元认知分析
stats       记忆统计

graph       搜索知识图谱
neighbors   查看实体关联

learn       自主学习循环
predict     预判用户需求
push        触发主动推送
briefing    生成每日简报

orchestrate 启动完整编排器
serve       启动 FastAPI + WebSocket
schedule    注册 Hermes cronjob
setup       初始化环境
```

## API

启动服务器：

```bash
deepspace serve
# → http://127.0.0.1:8645
# → WebSocket: ws://127.0.0.1:8645/ws
```

核心端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/remember` | POST | 存储记忆 |
| `/recall` | POST | 检索记忆 |
| `/stats` | GET | 统计信息 |
| `/reflect` | GET | 元认知 |
| `/graph/search?q=` | GET | 图谱搜索 |
| `/proactive/context` | GET | 当前上下文 |
| `/proactive/predict` | GET | 预判需求 |
| `/ws` | WebSocket | 实时通信 |

## 技术栈

| 组件 | 技术 |
|------|------|
| 核心语言 | Python 3.12+ |
| 向量存储 | PostgreSQL + pgvector |
| 知识图谱 | Neo4j 5 Community |
| LLM 后端 | DashScope / OpenAI 兼容 API |
| API 服务 | FastAPI + WebSocket |
| CLI | Click + Rich |

## 项目结构

```
opendeepspace/
├── core/                   # 核心引擎
│   ├── models.py           # 数据模型
│   ├── llm_client.py       # LLM 客户端
│   ├── memory_engine.py    # 四层记忆引擎
│   ├── autonomous_learner.py  # 自主学习器
│   ├── proactive_service.py   # 主动服务
│   └── orchestrator.py     # 多Agent编排
├── storage/                # 存储层
│   ├── pgvector_store.py   # PostgreSQL+pgvector
│   └── neo4j_store.py      # Neo4j 图存储
├── api/                    # API 服务
│   └── server.py           # FastAPI + WebSocket
├── integrations/           # 集成
│   └── hermes_bridge.py    # Hermes Agent 集成
├── cli/                    # CLI
│   └── deepspace.py        # 18个子命令
├── config/                 # 配置
│   └── config.yaml
├── scripts/                # 工具脚本
│   ├── seed_import.py      # 慢速导入 (含LLM处理)
│   └── fast_import.py      # 快速导入
└── docker-compose.yml      # Docker 编排
```

## 开发

```bash
pip install -e ".[dev]"
pytest
```

## 与 Hermes Agent 的关系

DeepSpace 完全独立运行。唯一的交集是：

- 可选：从 Hermes 配置文件读取 API key（当环境变量不可用时）
- 可选：通过 `deepspace schedule` 注册 Hermes cronjob 实现定时自动化

去掉这两点，DeepSpace 就是完全独立的系统。

## License

MIT