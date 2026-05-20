# DeepSpace — 自主学习记忆引擎

> **项目定位**: 基于 LLM Agent 的后台自主学习系统，具备记忆、知识图谱、自主执行、主动推送能力。
> **角色**: 独立开发者 / 架构师 / 全栈
> **代码量**: 5500+ 行 Python，1500+ 行 JavaScript，143 个测试用例
> **周期**: 从零到生产级，15 次迭代（v0.1 → v0.8.1）

---

## 一、项目概述

DeepSpace 是一个**运行在后台的 AI 记忆引擎**。与传统的被动笔记工具不同，它具有**主动性**——自动观察用户工作内容、构建结构化知识图谱、在系统空闲时自主学习知识空白、预判用户需求并主动推送，甚至能**自动执行解决方案**。

**一句话**: "AI 不只是记住你说过什么，而是主动思考你还需要什么，自己研究，自己执行，然后通知你。"

---

## 二、技术架构

### 2.1 四层记忆模型

```
短期记忆 (short_term) → 工作记忆 (working) → 长期记忆 (long_term)
       ↑                                              ↓
  ┌────┴──────────────────────────────────────────────┘
  │
元记忆 (meta) — "我们知道什么？不知道什么？该学什么？"
```

- **短期记忆**: 会话上下文，分钟~天，自动分类和重要性评分
- **工作记忆**: 项目活跃上下文，天~周，LLM 自动提取实体和关系
- **长期记忆**: 永久知识，经过验证和多轮访问确认，永不自动删除
- **元记忆**: 关于记忆的记忆，驱动自主学习方向

### 2.2 混合检索架构

```
查询 → ┌─ 向量搜索 (pgvector, 余弦相似度) ─┐
       │                                      ├→ 去重合并 → 按重要性排序 → 结果
       └─ 关键词搜索 (PostgreSQL FTS) ───────┘
```

### 2.3 知识图谱

- **Neo4j 5 Community**: 10 种实体类型，10 种关系类型
- **LLM 驱动**: 自动从记忆内容提取实体和关系，支持传递推理
- **D3.js 力导向可视化**: Dashboard 中拖拽探索图谱

### 2.4 Agent 编排系统

9 个专业化 Agent，通过 Orchestrator 协调：

| Agent | 职责 | 技术亮点 |
|-------|------|---------|
| Executive | 全局协调，优先级决策 | 从元记忆反思驱动目标生成 |
| Research | 搜索和知识获取 | 自动生成研究查询，合成多源信息 |
| Memory | 记忆存储和检索 | 混合向量+关键词+图谱三路检索 |
| Graph | 知识图谱维护 | 实体去重、关系推理、传递闭合 |
| Planning | 目标分解为可执行步骤 | LLM 结构化输出，3-7 步分解 |
| **Action** | **安全执行步骤** | **80+ 安全规则，沙箱执行** |
| **Verification** | **验证结果 + 自主恢复** | **失败自动研究→修复→重试** |
| Reflection | 元认知分析 | 知识空白识别、强项评估 |
| Proactive | 上下文感知推送 | CPU 空闲检测、成本预算控制 |

### 2.5 自主执行闭环

这是项目最核心的创新——从"回答问题"到"自主解决问题"：

```
Goal（用户描述目标，自然语言）
  → Plan（Planning Agent: LLM 分解为 3-7 个可执行 Shell 步骤）
    → Execute（Action Agent: 安全检查 → 沙箱执行 → 超时保护）
      → Verify（Verification Agent: LLM 对比预期 vs 实际输出）
        ├─ 失败 → Recovery（研究错误 → 生成修复命令 → 应用修复 → 重试，最多 2 轮）
        └─ 成功 → Learn（结果存入记忆，用于未来规划）
```

**安全机制**: 40+ 安全命令白名单（`ls`, `git status`），30+ 可修改命令灰名单（`pip install`, `git push`），10+ 危险命令黑名单（`rm -rf /`, `curl | sh`, fork bomb）

---

## 三、技术栈

| 层 | 技术选型 | 选型理由 |
|---|---------|---------|
| **语言** | Python 3.12+ | 生态丰富，AI/ML 首选 |
| **向量存储** | PostgreSQL + pgvector | 成熟可靠，支持混合查询（向量+FTS），比 Chroma 更适合生产 |
| **图谱存储** | Neo4j 5 Community | Cypher 查询语言强大，Community 版足够满足需求 |
| **LLM 后端** | DashScope / OpenAI API | 通过 ModelRouter 实现多 provider 容错切换 |
| **API 框架** | FastAPI + WebSocket | 高性能异步，自动 OpenAPI 文档，WebSocket 实时推送 |
| **CLI 框架** | Click + Rich | 声明式命令行，Rich 提供彩色表格/面板 |
| **前端** | Vanilla JS + D3.js | 零框架依赖，D3.js 力导向图可视化 |
| **容器化** | Docker + Docker Compose | 多阶段构建，70MB 最终镜像 |
| **测试** | pytest (143 tests) | 全 mock 单元测试 + 真数据库集成测试 |
| **CI/CD** | GitHub Actions | 自动测试 + ruff 代码检查 |

---

## 四、量化成果

| 指标 | 数值 |
|------|------|
| **版本迭代** | v0.1 → v0.8.1，15 次发布 |
| **源代码文件** | 25+ Python 模块 |
| **CLI 命令** | 30 个 |
| **API 端点** | 24 个 (REST + WebSocket) |
| **Agent** | 9 个专业化 Agent |
| **测试用例** | 143 unit + 9 integration = 152 total |
| **安全规则** | 80+ 命令分类规则 |
| **插件** | 3 个示例插件 + 5 个扩展点 |
| **文档** | 7 页完整文档 + CHANGELOG + README |
| **Git commits** | 15+ |

---

## 五、核心亮点（面试重点）

### 5.1 从零架构到生产级

- 自行设计四层记忆模型，从 Chroma 原型演进到 PostgreSQL+pgvector 生产方案
- 自行设计抽象存储接口（`VectorStore` / `GraphStore` / `RelationalStore`），允许替换后端
- 多阶段 Docker 构建，70MB 生产镜像

### 5.2 自主执行系统（项目最大创新）

- **Goal → Plan → Execute → Verify → Learn** 完整闭环
- **自主恢复**: 执行失败时不直接放弃，而是 LLM 分析错误→生成修复→应用→重试
- **安全沙箱**: 三道防线（白名单/灰名单/黑名单）、超时保护、工作目录限制
- **执行历史持久化**: 写入 PostgreSQL，服务重启不丢失

### 5.3 模型容错路由

- 自定义 `ModelRouter`，支持多 provider 配置
- 连续 3 次失败自动切换备用 provider
- 后台健康检查自动恢复（60s 间隔）
- 跟踪各 provider 失败率用于智能路由

### 5.4 插件系统

- 设计可扩展架构：5 个扩展点（action handler / execution handler / CLI / API / memory hook）
- 即插即用：创建 `plugin.json` + Python 类即可
- 启动时自动发现→加载→启用→注入执行器

### 5.5 错误的标准化处理

- 自定义 `ErrorCode` 枚举（25 种错误码）
- 6 种异常子类（ConfigError, LLMError, StorageError, GraphError, ExecutionError, MemoryError）
- API 层全局错误中间件，所有异常自动转为结构化 JSON 响应

### 5.6 全栈能力

- 后端: FastAPI + WebSocket + PostgreSQL + Neo4j
- 前端: Vanilla JS + D3.js 力导向图，6 标签页 Dashboard，WebSocket 实时更新
- CLI: 30 个命令，支持 `--json` 输出，Shell 自动补全
- DevOps: Docker Compose 一键部署，GitHub Actions CI

---

## 六、技术难点与解决方案

| 难点 | 解决方案 |
|------|---------|
| Neo4j Community 不支持 NODE KEY | 用 UNIQUE 约束替代，适配 5.x Python driver API |
| pgvector embedding 字符串解析 | RealDictCursor 返回的向量需手动 `split/strip` 解析 |
| psycopg2 `%` 与 SQL `%` 冲突 | 用 `similarity()` 函数替代百分号运算符 |
| `asyncio.run()` 嵌套崩溃 | `_load_plugins` 改为 `async def` + `await` |
| Python 模块名不能含连字符 | 插件目录 `echo-tool` → `echo_tool` |
| Docker 镜像源不稳定 | 多阶段构建 + 最小化依赖，支持离线构建 |
| CI 在无 Docker 环境失败 | 区分 unit test 和 integration test，CI 只跑 unit test |

---

## 七、项目结构

```
opendeepspace/
├── core/                    # 核心引擎 (15 模块)
│   ├── models.py            # 数据模型 (Memory, Entity, Goal, ActionStep...)
│   ├── memory_engine.py     # 四层记忆引擎 + 自动标签 + 去重
│   ├── llm_client.py        # LLM 客户端，集成 ModelRouter 容错
│   ├── orchestrator.py      # 9-Agent 编排器 + solve 闭环
│   ├── agent_executor.py    # 安全执行沙箱 (80+ 规则)
│   ├── model_router.py      # 多 provider 容错路由
│   ├── plugin_manager.py    # 插件发现/加载/生命周期
│   ├── proactive_service.py # 上下文感知 + 主动推送 + 桌面通知
│   ├── autonomous_learner.py # 空闲自主学习
│   ├── notifier.py          # 跨平台桌面通知
│   ├── timeline.py          # 时间线生成器
│   └── errors.py            # 标准化错误处理 (25 codes)
├── storage/                 # 存储层 (3 模块, 抽象接口 + 2 实现)
├── api/server.py            # FastAPI (24 endpoints) + WebSocket
├── cli/deepspace.py         # 30 Click 命令
├── plugins/                 # 3 个示例插件
├── templates/dashboard.html # 6-tab Dashboard + D3.js
├── tests/                   # 152 tests
└── docs/                    # 7 页文档
```

---

## 八、开发过程体现的能力

1. **系统设计**: 从需求（"想要一个记忆系统"）出发，设计四层模型、Agent 架构、存储接口
2. **工程实践**: Git 版本管理（9 个 tag）、语义化提交、CHANGELOG、CI/CD
3. **安全意识**: 命令沙箱、API Token 认证、默认密码文档提示
4. **用户体验**: 6 步向导 `deepspace init`、Shell 补全、`--json` 输出、Dashboard 导出
5. **文档能力**: 7 页文档 + ARCHITECTURE + CHANGELOG + API Reference
6. **迭代能力**: 15 次迭代，每次都增量添加功能并保持向后兼容