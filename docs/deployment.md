# 部署指南

## 快速部署

### 1. 克隆仓库

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
```

### 2. 启动数据库

```bash
docker compose up -d
```

这会启动两个容器：
- `deepspace-pg` — PostgreSQL 16 + pgvector，端口 5440
- `deepspace-neo4j` — Neo4j 5 Community，端口 7474/7687

健康检查会自动等待数据库就绪。

### 3. 安装 DeepSpace

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 4. 配置

复制并编辑配置：

```bash
cp config/config.yaml config/config.local.yaml
```

设置 API Key：

```bash
export DASHSCOPE_API_KEY="sk-your-api-key"
```

配置文件使用 `${DASHSCOPE_API_KEY}` 语法自动从环境变量读取。

### 5. 初始化

```bash
deepspace setup
```

这会创建数据库表、索引和约束。

### 6. 启动服务

```bash
# API 服务
deepspace serve

# 或者编排器（后台运行）
deepspace orchestrate
```

## Docker Compose 说明

`docker-compose.yml` 包含两个服务：

```yaml
services:
  deepspace-pg:
    image: pgvector/pgvector:pg16
    ports: ["5440:5432"]
    environment:
      POSTGRES_USER: deepspace
      POSTGRES_PASSWORD: deepspace

  deepspace-neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/deepspace123
```

### 数据持久化

数据存储在 Docker 卷中：
- `deepspace_pg_data` — PostgreSQL 数据
- `deepspace_neo4j_data` — Neo4j 数据
- `deepspace_neo4j_logs` — Neo4j 日志

## 生产环境

### 安全建议

1. **修改默认密码**：在 `docker-compose.yml` 中更改 `POSTGRES_PASSWORD` 和 `NEO4J_AUTH`
2. **限制网络访问**：API 服务默认绑定 `127.0.0.1`，不要暴露到公网
3. **使用密钥管理**：API Key 使用环境变量或 secrets manager
4. **启用 HTTPS**：在生产环境使用反向代理（nginx/Caddy）

### 使用其他 LLM 提供商

编辑 `config/config.yaml` 的 `llm` 部分：

```yaml
llm:
  provider: "openai"
  base_url: "https://api.openai.com/v1"
  api_key: "${OPENAI_API_KEY}"
  models:
    primary: "gpt-4o"
    light: "gpt-4o-mini"
    embedding: "text-embedding-3-small"
```

DeepSpace 兼容任何 OpenAI 兼容的 API。

### 使用 Hermes Agent 集成（可选）

DeepSpace 可以集成 Hermes Agent 实现定时自动化：

```bash
# 注册 Hermes cronjob
deepspace schedule

# DeepSpace 从 Hermes 配置读取 API key
# 当环境变量不可用时自动回退
```

### 系统服务

使用 systemd（Linux）：

```ini
[Unit]
Description=DeepSpace Memory Engine
After=docker.service

[Service]
User=your-user
WorkingDirectory=/opt/opendeepspace
Environment=DASHSCOPE_API_KEY=sk-...
ExecStart=/opt/opendeepspace/.venv/bin/deepspace serve
Restart=always

[Install]
WantedBy=multi-user.target
```

使用 launchd（macOS）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.deepspace.engine</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/you/opendeepspace/.venv/bin/deepspace</string>
        <string>serve</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DASHSCOPE_API_KEY</key>
        <string>sk-your-key</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

## 系统要求

| 组件 | 最低要求 |
|------|---------|
| Python | 3.12+ |
| Docker | 24+ |
| 内存 | 2GB+ |
| 磁盘 | 10GB+ (取决于记忆量) |
| 网络 | 访问 LLM API |