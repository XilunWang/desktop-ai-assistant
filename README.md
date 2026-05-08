# 桌面 AI 助手 (Desktop AI Assistant)

一个基于 **Electron + React + Express** 的桌面 AI 聊天助手，AI 能力通过 OpenAI 兼容协议接入，支持 OpenAI、DeepSeek、通义千问、本地 Ollama 等多种模型。

```env
# DeepSeek 示例:
# OPENAI_BASE_URL=https://api.deepseek.com/v1
# OPENAI_API_KEY=sk-xxx
# OPENAI_MODEL=deepseek-chat

# 本地 Ollama 示例:
# OPENAI_BASE_URL=http://localhost:11434/v1
# OPENAI_API_KEY=ollama
# OPENAI_MODEL=qwen2.5
```

## 技术栈

- **桌面端壳**：Electron
- **前端**：React 18 + Vite
- **后端**：Node.js + Express
- **AI**：OpenAI 兼容 Chat Completions API（流式 SSE）

## 目录结构

```
desktop-ai-assistant/
├── server/      # Express 后端，封装 AI 调用
└── client/      # Electron + React 前端
```

## 快速开始

### 1. 安装依赖

```bash
cd desktop-ai-assistant
npm run install:all
```

### 2. 配置 AI Key

复制 `server/.env.example` 为 `server/.env` 并填入：

```
PORT=3001
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-xxxxxx
OPENAI_MODEL=gpt-4o-mini
```

> 也可以填 DeepSeek / 通义 / 本地 Ollama 的兼容地址。
> 例如 Ollama：`OPENAI_BASE_URL=http://localhost:11434/v1`，`OPENAI_API_KEY=ollama`，`OPENAI_MODEL=qwen2.5`。

### 3. 启动开发模式

```bash
npm run dev
```

将同时启动：
- Express 后端（默认 http://localhost:3001）
- Vite 开发服务器 + Electron 桌面窗口

### 4. 打包桌面应用

```bash
npm run build
```

## 功能

- 桌面原生窗口（Electron）
- 多轮对话上下文
- AI 流式回复（打字机效果）
- 可切换模型 / 自定义 system prompt
- 一键清空会话

## License

MIT
