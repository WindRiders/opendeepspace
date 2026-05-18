# DeepSpace 文档

## 快速导航

- [架构设计](architecture.md) — 四层记忆模型、知识图谱、多Agent编排
- [API 参考](api.md) — REST API + WebSocket 端点
- [部署指南](deployment.md) — Docker Compose、生产环境配置
- [开发指南](development.md) — 扩展、贡献、调试

## 概览

DeepSpace 是一个运行在后台的 AI 记忆引擎。它观察你的工作、构建知识图谱、在空闲时自主学习、预判你的需求并主动推送相关信息。

### 核心能力矩阵

| 能力 | 命令 | 状态 |
|------|------|------|
| 记忆存储 | `deepspace remember` | ✅ |
| 混合检索 | `deepspace recall` | ✅ |
| 元认知反思 | `deepspace reflect` | ✅ |
| 记忆巩固 | `deepspace consolidate` | ✅ |
| 知识图谱 | `deepspace graph/neighbors` | ✅ |
| 自主学习 | `deepspace learn` | ✅ |
| 预判推送 | `deepspace predict/push` | ✅ |
| 每日简报 | `deepspace briefing` | ✅ |
| 自主执行 | `deepspace solve` | ✅ v0.3 |
| 自推导目标 | `deepspace auto-solve` | ✅ v0.4 |
| Web Dashboard | `http://localhost:8645/dashboard` | ✅ v0.5 |
| 桌面通知 | 自动推送 | ✅ v0.5 |
| 导出导入 | `deepspace export/import-memories` | ✅ v0.4 |
| 记忆去重 | `deepspace dedup` | ✅ v0.5 |
| 日志查看 | `deepspace logs -f` | ✅ v0.4 |
| Shell 补全 | `deepspace completion` | ✅ v0.3 |
| 配置向导 | `deepspace init` | ✅ v0.3 |
| Docker 部署 | `docker run windriders/opendeepspace` | ✅ v0.3 |
| 执行历史 | `deepspace executions` | ✅ v0.4 |

传统的笔记和记忆工具是被动的 — 你必须手动录入、手动检索。DeepSpace 是主动的：

- **观察** — 记录你的工作内容、决策、学习
- **整理** — 将碎片化信息构建成结构化知识图谱
- **学习** — 空闲时自动研究知识空白、跟踪前沿
- **预判** — 在正确的时机推送你需要的答案

### 四层记忆模型

```
短期记忆 (short_term) → 工作记忆 (working) → 长期记忆 (long_term)
                           ↑                      ↓
                    元记忆 (meta) ←───────────────┘
```

| 层级 | 说明 | 生命周期 | 存储位置 |
|------|------|---------|---------|
| 短期记忆 | 当前会话上下文 | 分钟~天 | pgvector |
| 工作记忆 | 项目相关上下文 | 天~周 | pgvector |
| 长期记忆 | 永久知识 | 永久 | pgvector |
| 元记忆 | 关于记忆的记忆 | 永久 | pgvector + Neo4j |

### 技术栈

| 组件 | 技术 |
|------|------|
| 核心语言 | Python 3.12+ |
| 向量存储 | PostgreSQL + pgvector |
| 知识图谱 | Neo4j 5 Community |
| LLM 后端 | DashScope / OpenAI 兼容 API |
| API 服务 | FastAPI + WebSocket |
| CLI | Click + Rich |