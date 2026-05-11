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
 *   data: {"aborted":true}                      // 被用户中止
 *   data: {"error":"..."}
 *   data: {"done":true}
 *
 * 中止：客户端关闭连接（fetch abort）即触发后端 AbortController，
 *      取消上游 LLM 流并跳出 Agent Loop。
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

    // ===== 客户端断开 → 中止上游 =====
    const ac = new AbortController();
    let clientClosed = false;
    const onClose = () => {
      clientClosed = true;
      ac.abort();
    };
    req.on('close', onClose);

    const send = (obj) => {
      if (clientClosed || res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch (e) {
        /* socket 可能已断 */
      }
    };

    try {
      const result = await chatAgent({
        model,
        messages: finalMessages,
        onText: (t) => send({ delta: t }),
        onToolStart: (e) => send({ tool_start: e }),
        onToolEnd: (e) => send({ tool_end: e }),
        signal: ac.signal
      });
      if (result?.aborted || clientClosed) {
        send({ aborted: true });
      } else {
        send({ done: true });
      }
    } catch (e) {
      if (clientClosed || ac.signal.aborted) {
        send({ aborted: true });
      } else {
        send({ error: e.message });
      }
    } finally {
      req.off?.('close', onClose);
      if (!res.writableEnded) res.end();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
