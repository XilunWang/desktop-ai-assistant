const express = require('express');
const { chatAgent } = require('../services/aiService');

const router = express.Router();

/**
 * POST /api/chat
 * body: { messages: [{role, content}], model?, system? }
 *
 * SSE 事件:
 *   data: {"delta":"..."}                       // LLM 文本增量
 *   data: {"tool_start":{id,name,args}}         // 开始执行工具
 *   data: {"tool_end":{id,name,args,result,isError}}
 *   data: {"error":"..."}
 *   data: {"done":true}
 */
router.post('/', async (req, res, next) => {
  try {
    const { messages = [], model, system } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages 不能为空' });
    }

    const finalMessages = [];
    if (system && typeof system === 'string' && system.trim()) {
      finalMessages.push({ role: 'system', content: system.trim() });
    }
    for (const m of messages) {
      if (m && m.role && typeof m.content === 'string') {
        finalMessages.push({ role: m.role, content: m.content });
      }
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    try {
      await chatAgent({
        model,
        messages: finalMessages,
        onText: (t) => send({ delta: t }),
        onToolStart: (e) => send({ tool_start: e }),
        onToolEnd: (e) => send({ tool_end: e })
      });
      send({ done: true });
    } catch (e) {
      send({ error: e.message });
    } finally {
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
