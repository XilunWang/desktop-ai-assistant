require('dotenv').config();
const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');
const mcp = require('./services/mcpManager');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查 + 工具列表
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    tools: mcp.getOpenAITools().map((t) => t.function.name)
  });
});

app.use('/api/chat', chatRouter);

app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

(async () => {
  try {
    await mcp.init();
  } catch (e) {
    console.error('[mcp init error]', e);
  }
  app.listen(PORT, () => {
    console.log(`[server] running at http://localhost:${PORT}`);
  });
})();

// 优雅退出
const cleanup = async () => {
  await mcp.shutdown();
  process.exit(0);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
