# API 参考

## 服务地址

```
REST API:  http://127.0.0.1:3001
WebSocket:  ws://127.0.0.1:3001/collab
```

所有鉴权接口需在 Header 中携带 JWT Token：
```
Authorization: Bearer <token>
```

---

## Auth — 认证

### POST /auth/login

登录，返回 JWT token。

请求：
```json
{
  "username": "admin",
  "password": "admin123"
}
```

响应：
```json
{
  "accessToken": "eyJhbGciOi...",
  "user": { "id": "...", "username": "admin", "email": "admin@deepspace.local" }
}
```

### POST /auth/register

注册新用户。限流：3 req/min。

请求：
```json
{
  "email": "user@example.com",
  "username": "newuser",
  "password": "password123"
}
```

### GET /auth/me <span style="color:#dc2626">JWT</span>

获取当前用户信息。

### PATCH /auth/me <span style="color:#dc2626">JWT</span>

更新个人信息或修改密码。

请求：
```json
{
  "username": "new-name",
  "avatarUrl": "https://...",
  "currentPassword": "old",
  "newPassword": "new"
}
```

---

## Agent — 智能体

### GET /agent/status

健康检查，返回在线状态、工具列表、可用模型。

响应：
```json
{
  "status": "online",
  "core": "DeepSpace Genesis",
  "tools": ["write_file", "list_files", "http_request", "shell_exec"],
  "models": ["deepseek-v3", "gpt-4o"],
  "phase": 2
}
```

### GET /agent/models

获取可用模型列表。

### POST /agent/interact <span style="color:#dc2626">JWT</span>

发送消息给智能体。限流：10 req/min。

请求：
```json
{
  "message": "分析这段代码的性能瓶颈",
  "dna": "你是一个资深性能优化专家...",
  "sessionId": "optional-existing-session-id",
  "modelId": "deepseek-v3"
}
```

响应：
```json
{
  "agentDna": "你是一个资深性能优化专家...",
  "reply": "根据分析，主要瓶颈在于...",
  "toolCalls": [
    { "step": 1, "toolName": "list_files", "args": {}, "result": "3 files found" }
  ],
  "totalSteps": 3,
  "sessionId": "uuid"
}
```

### POST /agent/interact/stream <span style="color:#dc2626">JWT</span>

SSE 流式版本，参数同 `/agent/interact`。限流：10 req/min。

响应为 NDJSON 格式的 Server-Sent Events：
```
data: {"type":"thinking","content":"正在分析问题..."}

data: {"type":"tool_call","toolName":"list_files","args":{}}

data: {"type":"text","content":"分析结果如下..."}

data: {"type":"done"}
```

### DELETE /agent/session/:sessionId <span style="color:#dc2626">JWT</span>

清除指定 session 的历史记录。

---

## Collab — 多智能体协作

### GET /collab/roles <span style="color:#dc2626">JWT</span>

获取可用智能体角色列表。

响应：
```json
[
  { "role": "planner", "name": "Planner", "description": "...", "icon": "..." },
  { "role": "coder", "name": "Coder", "description": "...", "icon": "..." },
  { "role": "reviewer", "name": "Reviewer", "description": "...", "icon": "..." },
  { "role": "researcher", "name": "Researcher", "description": "...", "icon": "..." }
]
```

### GET /collab/sessions <span style="color:#dc2626">JWT</span>

列出当前用户的协作会话。

### POST /collab/sessions <span style="color:#dc2626">JWT</span>

创建协作会话并自动规划执行顺序。

请求：
```json
{
  "task": "设计并实现用户认证模块",
  "agents": ["planner", "coder"]
}
```

响应：
```json
{
  "id": "uuid",
  "task": "设计并实现用户认证模块",
  "agents": ["planner", "coder"],
  "status": "planning",
  "messages": [...],
  "createdAt": 1716547200000
}
```

### GET /collab/sessions/:id <span style="color:#dc2626">JWT</span>

获取单个协作会话详情。

### DELETE /collab/sessions/:id <span style="color:#dc2626">JWT</span>

删除协作会话。

### POST /collab/sessions/:id/messages <span style="color:#dc2626">JWT</span>

向协作会话添加消息。

请求：
```json
{
  "from": "planner",
  "to": "coder",
  "content": "这是架构设计方案",
  "type": "handoff"
}
```

type 可选值：`task` | `response` | `handoff` | `summary`

### GET /collab/sessions/:id/stream <span style="color:#dc2626">JWT</span>

执行协作会话的 SSE 流。可选 query 参数 `?modelId=`。

SSE 事件类型：
```
data: {"type":"collab_agent_start","agentRole":"planner","agentName":"Planner"}

data: {"type":"collab_agent_chunk","agentRole":"planner","content":"部分输出..."}

data: {"type":"collab_agent_done","agentRole":"planner","fullContent":"完整输出"}

data: {"type":"collab_done","summary":"协作完成摘要"}
```

### WebSocket — /collab

连接：`ws://127.0.0.1:3001/collab`

客户端事件：

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `join-session` | C→S | `{sessionId}` | 加入协作房间 |
| `leave-session` | C→S | `{sessionId}` | 离开房间 |
| `send-message` | C→S | `{sessionId, from, to, content, type}` | 发送消息 |
| `typing` | C→S | `{sessionId, agent}` | 开始输入 |
| `stop-typing` | C→S | `{sessionId, agent}` | 停止输入 |
| `execute-session` | C→S | `{sessionId, modelId?}` | 启动执行流 |

服务端事件：

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `session-state` | S→C | `CollabSession` | 会话状态 |
| `session-updated` | S→C | `{sessionId, status}` | 状态变更 |
| `online-users` | S→C | `{sessionId, count}` | 在线人数 |
| `agent-message` | S→C | `CollabMessage` | 代理消息 |
| `agent-typing` | S→C | `{sessionId, agent, clientId}` | 某方正在输入 |
| `agent-stop-typing` | S→C | `{sessionId, agent}` | 停止输入 |
| `collab-agent-start` | S→C | `{sessionId, agentRole, agentName}` | 代理开始执行 |
| `collab-agent-chunk` | S→C | `{sessionId, agentRole, content}` | 实时输出片段 |
| `collab-agent-done` | S→C | `{sessionId, agentRole, fullContent}` | 代理执行完成 |
| `collab-done` | S→C | `{sessionId, summary}` | 全部执行完成 |
| `collab-error` | S→C | `{sessionId, message}` | 执行错误 |

---

## Marketplace — 智能体市场

### GET /marketplace

获取已发布的智能体列表。

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 搜索关键词 |
| `tag` | string | 按标签筛选 |
| `limit` | number | 每页数量（默认 50，最大 100） |
| `offset` | number | 偏移量（默认 0） |

响应：
```json
[
  {
    "id": "uuid",
    "name": "Python 代码审查专家",
    "description": "擅长 Python 代码质量分析和最佳实践建议",
    "dna": "你是一个经验丰富的 Python 代码审查专家...",
    "author": { "id": "...", "username": "dev123" },
    "tags": ["python", "code-review"],
    "stars": 42,
    "downloads": 128,
    "createdAt": 1716547200000
  }
]
```

### GET /marketplace/:id

获取单个市场智能体详情。

### POST /marketplace <span style="color:#dc2626">JWT</span>

发布智能体到市场。

请求：
```json
{
  "name": "我的智能体",
  "description": "简洁描述",
  "dna": "你的角色设定和指令...",
  "tags": ["python", "debugging"],
  "modelId": "deepseek-v3"
}
```

### POST /marketplace/:id/star <span style="color:#dc2626">JWT</span>

收藏/星标智能体。

### POST /marketplace/:id/download

增加下载计数（公开接口）。

响应：
```json
{ "downloads": 129 }
```

### DELETE /marketplace/:id <span style="color:#dc2626">JWT</span>

删除自己发布的智能体。

---

## Plugins — 插件系统

### GET /plugins

列出所有已安装插件。

响应：
```json
[
  {
    "id": "file-manager",
    "name": "File Manager",
    "version": "1.0.0",
    "description": "文件系统操作工具集",
    "author": "deepspace",
    "enabled": true,
    "toolCount": 3,
    "tools": ["write_file", "list_files", "read_file"],
    "loadedAt": 1716547200000
  }
]
```

### POST /plugins/:pluginId/reload

重新加载指定插件。404 当插件不存在。

响应：
```json
{ "success": true, "pluginId": "file-manager", "toolCount": 3 }
```

### POST /plugins/:pluginId/toggle

启用/停用插件。404 当插件不存在。

请求：
```json
{ "enabled": false }
```

响应：
```json
{ "success": true, "pluginId": "file-manager", "enabled": false, "toolCount": 0 }
```

### POST /plugins/install

从目录安装新插件。400 当路径无效或安装失败。

请求：
```json
{ "dirPath": "/path/to/plugin" }
```

响应：
```json
{ "success": true, "id": "new-plugin", "name": "New Plugin", "toolCount": 2 }
```

---

## Traces — 执行追踪

### GET /traces <span style="color:#dc2626">JWT</span>

列出用户执行追踪记录。可选 query `?sessionId=` 按会话筛选。

### GET /traces/:id <span style="color:#dc2626">JWT</span>

获取单条追踪详情。404 当不存在或无权限。

### DELETE /traces/:id <span style="color:#dc2626">JWT</span>

删除追踪记录。404 当不存在或无权限。

---

## Shares — 分享

### GET /shares <span style="color:#dc2626">JWT</span>

列出自己的所有分享。

### POST /shares <span style="color:#dc2626">JWT</span>

创建分享。

请求：
```json
{
  "type": "dna",
  "title": "我的编程助手设定",
  "payload": "你是一个..."
}
```

type 可选值：`dna` | `template` | `trace`

### GET /shares/:id

获取分享内容（公开接口，任何人拿到链接可查看）。

### DELETE /shares/:id <span style="color:#dc2626">JWT</span>

删除自己的分享。404 当不存在或无权限。

---

## Templates — 模板

### GET /templates

获取所有可用模板列表。

### GET /templates/:id

获取单个模板详情。404 当不存在。

---

## Sandbox — 沙箱 <span style="color:#dc2626">JWT</span>

### GET /sandbox/files

列出沙箱文件。可选 query `?path=subdir`。

### GET /sandbox/read

读取沙箱文件内容。必填 query `?path=file.txt`。

400 当 `path` 参数缺失或路径非法。

---

## Conversations — 对话 <span style="color:#dc2626">JWT</span>

### GET /conversations

列出当前用户的所有对话。

### DELETE /conversations/:id

删除对话。404 当不存在或无权限。

### PATCH /conversations/:id/title

更新对话标题。

请求：
```json
{ "title": "新的对话标题" }
```

404 当对话不存在。

---

## 错误码

| HTTP Status | Code | 说明 |
|-------------|------|------|
| 401 | `LLM_AUTH_ERROR` | LLM API Key 配置错误 |
| 429 | `SESSION_LIMIT` | Session 数量超限 |
| 504 | `LLM_TIMEOUT` | LLM 调用超时 |
| 500 | `AGENT_ERROR` | 通用智能体执行错误 |