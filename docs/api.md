# API 参考

## 服务启动

```bash
deepspace serve
# → REST API: http://127.0.0.1:8645
# → WebSocket: ws://127.0.0.1:8645/ws
```

## REST API

### 健康检查

```
GET /health
```

响应：
```json
{"status": "ok", "version": "0.2.0"}
```

### 记忆管理

#### 存储记忆

```
POST /remember
Content-Type: application/json

{
  "content": "记忆内容",
  "project": "optional-project",
  "tags": ["tag1", "tag2"],
  "layer": "short_term",
  "memory_type": "fact"
}
```

响应：
```json
{
  "id": "abc123...",
  "content": "记忆内容",
  "layer": "short_term",
  "importance": 0.75,
  "created_at": "2026-05-18T10:00:00Z"
}
```

#### 检索记忆

```
POST /recall
Content-Type: application/json

{
  "query": "搜索关键词",
  "project": "optional-project",
  "top_k": 10,
  "layer": "working"
}
```

响应：
```json
{
  "results": [
    {
      "id": "abc123...",
      "content": "...",
      "layer": "working",
      "importance": 0.85,
      "similarity": 0.92
    }
  ],
  "count": 5
}
```

#### 查看记忆详情

```
GET /memory/{id}
```

#### 删除记忆

```
DELETE /memory/{id}
```

删除成功后返回：
```json
{"deleted": true}
```

### 统计

```
GET /stats
```

响应：
```json
{
  "total_memories": 156,
  "by_layer": {
    "short_term": 23,
    "working": 89,
    "long_term": 44,
    "meta": 0
  }
}
```

### 元认知

```
GET /reflect
```

响应：
```json
{
  "knowledge_summary": "熟练掌握 Python 后端开发、AI Agent 架构...",
  "strengths": [
    {"domain": "Python", "confidence": 0.9},
    {"domain": "PostgreSQL", "confidence": 0.8}
  ],
  "gaps": [
    {"topic": "Kubernetes", "reason": "未涉及容器编排", "priority": 0.6}
  ],
  "recommendations": ["学习 Kubernetes 基础", "深入研究 pgvector 性能优化"]
}
```

### 记忆巩固

```
POST /consolidate
```

响应：
```json
{
  "short_term_processed": 23,
  "promoted_to_working": 8,
  "promoted_to_long_term": 3,
  "entities_extracted": 12,
  "relations_inferred": 5,
  "forgotten": 2,
  "errors": []
}
```

### 知识图谱

#### 搜索实体

```
GET /graph/search?q=PostgreSQL&type=Tool
```

响应：
```json
{
  "entities": [
    {
      "id": "...",
      "name": "PostgreSQL",
      "type": "Tool",
      "description": "开源关系型数据库"
    }
  ]
}
```

#### 查看实体邻居

```
GET /graph/neighbors/{entity_name}
```

响应：
```json
{
  "entity": {"name": "PostgreSQL", "type": "Tool"},
  "relations": [
    {
      "source": "TimeMap",
      "relation": "USES",
      "target": "PostgreSQL"
    }
  ]
}
```

### 主动服务

#### 获取上下文

```
GET /proactive/context
```

响应：
```json
{
  "active_project": "deepspace",
  "active_topics": ["Python", "Neo4j", "记忆系统"],
  "current_focus": "开发自主学习引擎",
  "recent_activity": "coding",
  "timestamp": "2026-05-18T10:00:00Z"
}
```

#### 预判需求

```
GET /proactive/predict
```

响应：
```json
{
  "predictions": [
    {
      "type": "knowledge_gap_alert",
      "topic": "Neo4j 性能优化",
      "relevance": 0.85,
      "priority": 0.68,
      "action": "研究 Neo4j 查询优化方法"
    }
  ]
}
```

#### 每日简报

```
GET /proactive/briefing
```

响应：
```json
{
  "briefing": "今日简报内容...",
  "date": "2026-05-18"
}
```

### 编排器

```
POST /orchestrator/cycle
```

执行一个完整的编排循环，返回：
```json
{
  "reflection": {...},
  "consolidation": {...},
  "learning_tasks": [...],
  "predictions": [...]
}
```

### 自主执行 (v0.3+)

```
POST /solve
```

请求：
```json
{"goal": "check system status", "context": "", "mode": "semi_auto"}
```

### 自主推导 (v0.4+)

```
POST /orchestrator/auto-solve
GET  /goals
```

### 执行历史 (v0.4+)

```
GET /executions?limit=20
```

### 去重 (v0.5+)

```
POST /dedup?threshold=0.85&dry_run=false
```

### 时间线 (v0.6+)

```
GET /timeline?days=30&project=deepspace
```

### 数据分析 (v0.7+)

```
GET /analytics?days=60
```

返回项目热力图、记忆类型分布、重要性分布、增长曲线。

### 插件 (v0.8+)

```
GET /plugins     # 插件列表和状态
```

### 模型状态 (v0.6+)

```
GET /model-status  # 模型路由器健康状态
```

## WebSocket API

连接：`ws://127.0.0.1:8645/ws`

### 发送消息

```json
{
  "type": "command",
  "action": "remember",
  "payload": {
    "content": "记忆内容",
    "project": "test"
  }
}
```

### 接收推送

```json
{
  "type": "push",
  "message": "...",
  "timestamp": "2026-05-18T10:00:00Z"
}
```

### 支持的命令

| action | 说明 |
|--------|------|
| remember | 存储记忆 |
| recall | 检索记忆 |
| reflect | 元认知分析 |
| context | 获取上下文 |
| predict | 预判需求 |