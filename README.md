<p align="center">
  <img src="https://img.shields.io/badge/tests-143%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/version-0.8.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/python-3.12%2B-blue" alt="Python">
  <img src="https://img.shields.io/badge/agents-9-orange" alt="Agents">
  <img src="https://img.shields.io/badge/commands-30-brightgreen" alt="Commands">
  <img src="https://img.shields.io/badge/plugins-3-brightgreen" alt="Plugins">
</p>

> 一个基于大模型的自主学习记忆系统。**观察你的工作，构建知识图谱，自主学习，主动推送，自主解决问题。**

DeepSpace 运行在后台。它不只是记住你说过什么——它会**主动思考**你还需要什么，**自己研究**知识空白，**自动执行**解决方案，然后**推送通知**告诉你结果。

##   What's New in v0.8

| 功能 | 说明 |
|------|------|
|   Plugin Ecosystem | timer_tool (延迟/倒计时), webhook_tool (外部API调用), echo_tool (测试) |
|   Auto-Tagging | LLM 自动为新记忆推荐标签，写入数据库 |
|   Unified Search | `deepspace search` — 并行搜索记忆+知识图谱 |
|   Dashboard Export | 一键下载 stats + executions 为 JSON |
|   Model Failover | 多 provider 自动容错切换 + 健康检查恢复 |
|   API Auth | Bearer token 保护 /solve 端点 |
|   Analytics | 项目热力图、记忆类型分布、增长曲线 |
|   D3.js Graph | Dashboard 力导向知识图谱可视化 |
|   Timeline | 60天记忆+执行时间线 |
|   WebSocket Live | Dashboard 实时更新 + 桌面通知推送 |

### Quick Start

```bash
# pip install
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
pip install -e ".[dev]"
export DASHSCOPE_API_KEY="sk-..."
deepspace init

# or Docker
docker run -d -e DASHSCOPE_API_KEY=sk-xxx -p 8645:8645 windriders/opendeepspace

# try it
deepspace remember "Hello DeepSpace"
deepspace recall "Hello"
deepspace solve "check system status"
deepspace serve  # then open http://localhost:8645/dashboard
```