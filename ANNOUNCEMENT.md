# DeepSpace 开源发布 — 打造你的 AI 记忆引擎

> 一个基于 LLM Agent 的自主学习记忆系统，今天正式开源。

## 为什么做 DeepSpace？

作为开发者，我们每天都在产生大量信息：技术决策、Bug 修复方案、项目架构理解、工具配置技巧... 但这些知识散落在聊天记录、终端历史、代码注释里。传统的笔记工具是被动的 — 你必须**记得去记**。

DeepSpace 想做的是反过来：一个**主动**的记忆引擎。

它运行在后台，默默地：
- 观察你的工作内容
- 把碎片信息整理成知识图谱  
- 在系统空闲时自动学习你的知识空白
- 在你需要的时候，主动推送相关的答案

## 架构一览

DeepSpace 不是又一个笔记应用。它是一个四层记忆引擎：

```
短期记忆 → 工作记忆 → 长期记忆
    ↑                    ↓
 元记忆 ←────────────────┘
```

- **短期记忆**：当前会话的上下文，分钟到天的生命周期
- **工作记忆**：项目的活跃上下文，天到周
- **长期记忆**：经过验证的永久知识
- **元记忆**：关于记忆的记忆 — "我知道什么？不知道什么？"

背后是 PostgreSQL + pgvector 做向量存储，Neo4j 做知识图谱，7 个专业 Agent 协调工作。

## 能做什么？

```bash
# 存储一条记忆
deepspace remember "TimeMap 使用 Prisma ORM，数据库端口 5438"

# 混合检索（向量 + 关键词）
deepspace recall "TimeMap 数据库配置"

# 知识图谱搜索
deepspace graph "PostgreSQL"

# 查看实体关联
deepspace neighbors "TimeMap"

# 元认知：分析你的知识结构
deepspace reflect

# 获取每日简报
deepspace briefing

# 预判你的需求
deepspace predict
```

也有完整的 REST API + WebSocket，可以接入任何工作流。

## 自主学习模式

这是 DeepSpace 最特别的功能。当系统空闲时（CPU < 30%），它会：

1. 反思知识图谱，找到知识空白
2. 生成研究查询
3. 自主学习并整合结果
4. 更新图谱和记忆

就像一个不知疲倦的研究助理，默默填补你的知识盲区。

## 主动推送

DeepSpace 会分析你当前的工作上下文，预判你可能需要什么：

> "你正在开发 DeepSpace 的 Neo4j 集成，也许你想看看 `cypher-shell` 的批量导入参数？"

不是通知轰炸 — 每天最多 5 次，间隔至少 30 分钟，只有高置信度时才推送。

## 与 LLM 的关系

DeepSpace 依赖 LLM 做智能处理（分类、总结、实体提取），但它本身不绑定任何特定模型。默认使用阿里云 DashScope，也可以切换到任何 OpenAI 兼容 API。

DeepSpace 也完全独立于 Hermes Agent — 唯一的交集是可选的 cronjob 调度。

## 技术栈

| 组件 | 选型 |
|------|------|
| 语言 | Python 3.12+ |
| 向量存储 | PostgreSQL + pgvector |
| 知识图谱 | Neo4j 5 Community |
| LLM | DashScope / OpenAI 兼容 |
| API | FastAPI + WebSocket |
| CLI | Click + Rich |

## 路线图

- [x] 四层记忆引擎
- [x] Neo4j 知识图谱
- [x] 自主学习器
- [x] 主动预判推送
- [x] 多 Agent 编排
- [x] REST API + WebSocket
- [ ] 前端 Dashboard
- [ ] 多模态记忆（图片、代码文件）
- [ ] 协作记忆（团队共享图谱）
- [ ] 时间线视图

## 开始使用

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
docker compose up -d
pip install -e ".[dev]"
export DASHSCOPE_API_KEY="sk-..."
deepspace setup
deepspace serve
```

详细文档：[docs/index.md](docs/index.md)

## 贡献

欢迎所有形式的贡献！查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

**DeepSpace 是你的第二大脑。让它为你工作。**

[GitHub](https://github.com/WindRiders/opendeepspace) · [文档](docs/index.md) · [MIT License](LICENSE)