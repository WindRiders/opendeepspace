# DeepSpace 文档

## 快速导航

- [架构设计](architecture.md) — 四层记忆模型、知识图谱、多Agent编排
- [API 参考](api.md) — REST API + WebSocket 端点
- [部署指南](deployment.md) — Docker Compose、生产环境配置
- [开发指南](development.md) — 扩展、贡献、调试

## 概览

DeepSpace 是一个运行在后台的 AI 记忆引擎。它观察你的工作、构建知识图谱、在空闲时自主学习、预判你的需求并主动推送相关信息。

### 核心理念

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