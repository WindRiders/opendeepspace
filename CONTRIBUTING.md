# Contributing to DeepSpace

## 开发环境

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## 项目架构

阅读 `README.md` 了解整体架构。核心概念：

- **Memory Engine** (`core/memory_engine.py`) — 四层记忆模型
- **Knowledge Graph** (`storage/neo4j_store.py`) — Neo4j 图存储
- **Autonomous Learner** (`core/autonomous_learner.py`) — 空闲时自主学习
- **Orchestrator** (`core/orchestrator.py`) — 多Agent协调

## 添加新的记忆类型

编辑 `core/models.py` 中的 `MemoryType` 枚举。

## 添加新的实体/关系类型

编辑 `core/models.py` 中的 `EntityType` 和 `RelationType` 枚举。

## 添加新的 Agent

在 `core/orchestrator.py` 中：
1. 添加 `AgentRole` 枚举值
2. 实现 `_agent_xxx` 方法
3. 在 `dispatch()` 中注册

## 添加新的 CLI 命令

在 `cli/deepspace.py` 中添加 `@cli.command()` 函数。

## 运行测试

```bash
pytest tests/ -v
```

## 提交规范

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `chore:` 杂项