# DeepSpace v0.8 文档

## 快速导航

- [架构设计](architecture.md) — 四层记忆模型、知识图谱、多Agent编排
- [API 参考](api.md) — REST API + WebSocket 端点
- [部署指南](deployment.md) — Docker Compose、生产环境配置
- [开发指南](development.md) — 扩展、插件、贡献、调试

> **当前版本**: v0.8.1 · 143 tests · 30 CLI commands · 9 agents · 3 plugins

## 概览

DeepSpace 是一个运行在后台的 AI 记忆引擎。它不只是记住你说过什么——它会**主动思考**你还需要什么，**自己研究**知识空白，**自动执行**解决方案，然后**推送通知**告诉你结果。

## 核心能力矩阵

| 能力 | 命令/入口 | 版本 |
|------|-----------|------|
| 记忆存储 | `deepspace remember` | v0.1 |
| 混合检索 | `deepspace recall` | v0.1 |
| 统一搜索 | `deepspace search` | v0.8 |
| 元认知反思 | `deepspace reflect` | v0.1 |
| 记忆巩固 | `deepspace consolidate` | v0.1 |
| 知识图谱 | `deepspace graph/neighbors` | v0.2 |
| 自主学习 | `deepspace learn` | v0.2 |
| 预判推送 | `deepspace predict/push` | v0.2 |
| 每日简报 | `deepspace briefing` | v0.2 |
| 自主执行 | `deepspace solve` | v0.3 |
| 自推导目标 | `deepspace auto-solve` | v0.4 |
| 桌面通知 | 自动推送 macOS/Linux/Windows | v0.5 |
| 导出导入 | `deepspace export/import-memories` | v0.4 |
| 记忆去重 | `deepspace dedup` | v0.5 |
| 日志查看 | `deepspace logs -f` | v0.4 |
| Shell 补全 | `deepspace completion` | v0.3 |
| 配置向导 | `deepspace init` | v0.3 |
| Docker 部署 | `docker run windriders/opendeepspace` | v0.3 |
| 执行历史 | `deepspace executions` | v0.4 |
| Web Dashboard | `http://localhost:8645/dashboard` (6 tabs) | v0.5 |
| D3.js 图谱 | Dashboard Graph tab 力导向图 | v0.5 |
| WebSocket 实时 | Dashboard 自动刷新 + 推送 | v0.5 |
| 模型容错 | 多 provider 自动切换 + 健康检查 | v0.6 |
| 插件系统 | `deepspace plugins` — 3 个示例插件 | v0.8 |
| 时间线 | `deepspace timeline` + Dashboard Timeline tab | v0.6 |
| API 认证 | Bearer token 保护 | v0.7 |
| 数据分析 | `GET /analytics` — 项目/类型/增长 | v0.7 |
| 自动标签 | LLM 自动建议标签 | v0.8 |

## 快速开始

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
pip install -e ".[dev]"
export DASHSCOPE_API_KEY="sk-..."
deepspace init
deepspace serve  # → http://localhost:8645/dashboard
```

## 四层记忆模型

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

## 技术栈

| 组件 | 技术 |
|------|------|
| 核心语言 | Python 3.12+ |
| 向量存储 | PostgreSQL + pgvector |
| 知识图谱 | Neo4j 5 Community |
| LLM 后端 | DashScope / OpenAI 兼容 API |
| API 服务 | FastAPI + WebSocket |
| CLI | Click + Rich |
| 前端 | Vanilla JS + D3.js |
| 容器 | Docker + Docker Compose |