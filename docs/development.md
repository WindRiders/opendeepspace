# 开发指南

## 环境配置

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## 项目结构

```
opendeepspace/
├── core/                      # 核心引擎
│   ├── models.py              # 数据模型（Memory, Entity, Relation, etc.）
│   ├── llm_client.py          # LLM 客户端封装
│   ├── memory_engine.py       # 四层记忆引擎
│   ├── autonomous_learner.py  # 自主学习器
│   ├── proactive_service.py   # 主动服务层
│   └── orchestrator.py        # 多Agent编排器
├── storage/                   # 存储层
│   ├── interfaces.py          # 抽象接口
│   ├── pgvector_store.py      # PostgreSQL+pgvector 实现
│   └── neo4j_store.py         # Neo4j 图存储实现
├── api/                       # API 服务
│   └── server.py              # FastAPI + WebSocket
├── cli/                       # CLI
│   └── deepspace.py           # 18个子命令
├── integrations/              # 外部集成
│   └── hermes_bridge.py       # Hermes Agent 集成
├── config/                    # 配置
│   └── config.yaml
├── scripts/                   # 工具脚本
│   ├── seed_import.py         # 慢速种子导入（含LLM）
│   └── fast_import.py         # 快速批量导入
└── docker-compose.yml         # Docker 编排
```

## 添加新功能

### 开发插件 (v0.8+)

创建 `plugins/<name>/plugin.json` + `__init__.py`：

```json
{"name": "my_plugin", "version": "0.1.0", "provides": ["action:my_action"]}
```

```python
from core.plugin_manager import Plugin
class MyPlugin(Plugin):
    def get_execution_handlers(self):
        return {"my_action": self._handle}
    async def _handle(self, step, executor):
        from core.models import ActionResult, StepStatus
        return ActionResult(step_id=step.id, step_number=step.step_number,
                           status=StepStatus.COMPLETED, stdout="done", exit_code=0)
```

扩展点：`get_action_handlers`, `get_execution_handlers`, `get_cli_commands`, `get_api_routes`, `get_memory_hooks`

### 添加新的记忆类型

编辑 `core/models.py` 中的 `MemoryType` 枚举：

```python
class MemoryType(str, Enum):
    # ... existing types ...
    MY_NEW_TYPE = "my_new_type"   # 新增
```

### 添加新的实体/关系类型

编辑 `core/models.py` 中的 `EntityType` 或 `RelationType` 枚举：

```python
class EntityType(str, Enum):
    # ... existing types ...
    MY_ENTITY = "MyEntity"        # 新增
```

### 添加新的 Agent

在 `core/orchestrator.py` 中：

1. 添加 `AgentRole` 枚举值
2. 实现 `_agent_xxx` 方法
3. 在 `dispatch()` 中注册路由

### 添加新的 CLI 命令

在 `cli/deepspace.py` 中：

```python
@cli.command()
@click.argument('name')
@click.option('--flag', is_flag=True)
def my_command(name, flag):
    """Do something cool."""
    ...
```

### 添加新的 API 端点

在 `api/server.py` 中：

```python
@app.get("/my/endpoint")
async def my_endpoint(q: str = ""):
    return {"result": "..."}
```

## 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 带覆盖率
pytest tests/ -v --cov=core --cov=storage --cov-report=html

# 运行特定测试文件
pytest tests/test_memory_engine.py -v
```

## 代码风格

```bash
# 格式化
pip install ruff
ruff check core/ storage/ api/ cli/
ruff format core/ storage/ api/ cli/
```

## Git 提交规范

使用语义化提交信息：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档更新
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具/杂项

示例：
```
feat: add hybrid search with vector + keyword fusion
fix: handle Neo4j connection pool exhaustion
docs: add deployment guide for production
```

## 调试

### 启用详细日志

```bash
DEEP_SPACE_LOG_LEVEL=DEBUG deepspace serve
```

或在 `config/config.yaml` 中：

```yaml
logging:
  level: "DEBUG"
```

### 本地开发不用 Docker

如果已经有 PostgreSQL + pgvector 和 Neo4j 本地运行，直接修改 `config/config.yaml` 中的连接信息即可。

### Neo4j Browser

启动服务后访问：http://localhost:7474

可以直观查看知识图谱结构和执行 Cypher 查询。

## 架构决策记录 (ADR)

### 为什么用 PostgreSQL + pgvector 而非 Chroma？

- Chroma 适合原型开发，但生产环境持久性和查询能力不足
- PostgreSQL 提供成熟的全文搜索、事务支持、备份恢复
- pgvector 提供 IVFFlat/HNSW 索引，性能可满足需求

### 为什么用 Neo4j Community 而非 Enterprise？

- Community 版已足够满足知识图谱需求
- 避免许可证成本和复杂性
- 限制：不支持 NODE KEY 约束，需用 UNIQUE 替代

### 为什么抽象存储接口？

`storage/interfaces.py` 定义了 `VectorStore`、`GraphStore`、`RelationalStore` 抽象基类，允许：
- 替换存储后端（如切换到 Qdrant 或 Milvus）
- Mock 测试（不依赖真实数据库）
- 渐进式迁移