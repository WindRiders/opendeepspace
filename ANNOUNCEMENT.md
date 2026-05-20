# DeepSpace v0.8 — 完整开源的自主学习记忆引擎

> 四层记忆 + Neo4j 知识图谱 + 9个 Agent + 自主执行 + 桌面通知 + Web Dashboard + 插件系统

## 从 v0.1 到 v0.8，做了什么

DeepSpace 最初只是一个"能记住东西"的原型。经过 15 次迭代，它现在是一个**完整的自主学习记忆引擎**。

### 记忆引擎 (v0.1-v0.2)

- 四层记忆模型：短期 → 工作 → 长期 → 元记忆
- PostgreSQL + pgvector 向量存储，Neo4j 知识图谱
- 18 个 CLI 命令，REST API + WebSocket

### 自主执行 (v0.3-v0.4)

- `deepspace solve "目标"` — Goal → Plan → Execute → Verify → Learn 全闭环
- `deepspace auto-solve` — 从知识空白自动推导目标并执行
- 自主恢复：失败步骤自动研究修复后重试
- 导出导入、日志面板、错误处理标准化
- Web Dashboard 四标签页

### 智能体验 (v0.5)

- D3.js 力导向知识图谱可视化
- macOS/Linux/Windows 桌面通知
- `--json` 输出模式，pipe 给 jq
- LLM 语义去重，自动合并重复记忆
- WebSocket 实时 Dashboard 更新

### 容错 + 生态 (v0.6-v0.8)

- 模型路由器：多 provider 自动容错切换 + 健康检查恢复
- 插件系统：3 个示例插件 (echo_tool, timer_tool, webhook_tool)
- 时间线视图：60 天记忆+执行历史
- API 认证：Bearer token 保护
- 数据分析：项目热力图、类型分布、增长曲线
- 统一搜索：`deepspace search` 并行搜索记忆+图谱
- 自动标签：LLM 为新记忆推荐标签

## 快速开始

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
pip install -e ".[dev]"
export DASHSCOPE_API_KEY="sk-..."
deepspace init

# 试试看
deepspace remember "Hello DeepSpace"
deepspace recall "Hello"
deepspace search "DeepSpace"
deepspace solve "check system status"
deepspace serve  # → http://localhost:8645/dashboard
```

## 架构

```
┌──────────────────────────────────────────────┐
│              DeepSpace Core                  │
│                                              │
│  Memory Engine  ←→  Knowledge Graph (Neo4j)  │
│  (pgvector)           + D3.js 可视化        │
│                                              │
│  Autonomous Learner   Proactive Service      │
│  + Auto-tagging       + Desktop 通知         │
│                                              │
│  Agent Orchestrator (9 agents)               │
│  Executive/Research/Memory/Graph/Planning/   │
│  Action/Verification/Reflection/Proactive    │
│                                              │
│  Model Router         Plugin Manager         │
│  (容错切换)           (3 plugins)            │
│                                              │
│  FastAPI + WebSocket  ←→  Web Dashboard      │
│  (24 endpoints)           (6 tabs)           │
└──────────────────────────────────────────────┘
```

## 数字

- 143 tests, 100% pass
- 30 CLI commands
- 24 API endpoints
- 9 specialized agents
- 3 example plugins
- 1 Docker image
- MIT License

[GitHub](https://github.com/WindRiders/opendeepspace) · [文档](https://windriders.github.io/opendeepspace/)