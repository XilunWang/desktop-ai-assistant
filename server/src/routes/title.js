/**
 * POST /api/title
 * body: { messages: [{role, content}], model? }
 * resp: { title }
 *
 * 用一次非流式 chat/completions 调用 LLM 生成简短标题。
 * 失败时返回兜底标题（用首条用户消息截断）。
 */
const express = require('express');

const router = express.Router();

const TITLE_PROMPT =
  '你是一个对话标题生成器。请根据下面的对话内容，用不超过 12 个汉字概括主题，' +
  '只输出标题本身，不要包含引号、标点或任何额外说明。';

function getConfig() {
  return {
    baseURL: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    ),
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  };
}

function fallbackTitle(messages) {
  const firstUser = messages.find((m) => m && m.role === 'user' && m.content);
  if (!firstUser) return '新对话';
  const t = String(firstUser.content).replace(/\s+/g, ' ').trim();
  return t.length > 16 ? t.slice(0, 16) + '…' : t || '新对话';
}

function sanitizeTitle(raw) {
  if (!raw) return '';
  let t = String(raw).trim();
  // 去常见包裹符号
  t = t.replace(/^["'“”‘’`「『《\[\(]+|["'“”‘’`」』》\]\)]+$/g, '');
  // 折叠空白
  t = t.replace(/\s+/g, ' ').trim();
  // 限长
  if (t.length > 24) t = t.slice(0, 24);
  return t;
}

router.post('/', async (req, res, next) => {
  try {
    const { messages = [], model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages 不能为空' });
    }

    // 只取前几条 + 截断长度，避免浪费 token
    const trimmed = messages.slice(0, 6).map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string' && m.content.length > 500
          ? m.content.slice(0, 500) + '…'
          : m.content
    }));

    const cfg = getConfig();
    const url = `${cfg.baseURL}/chat/completions`;

    let title = '';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: model || cfg.model,
          stream: false,
          temperature: 0.3,
          max_tokens: 32,
          messages: [
            { role: 'system', content: TITLE_PROMPT },
            ...trimmed,
            { role: 'user', content: '请给以上对话生成一个简短中文标题。' }
          ]
        })
      });
      if (resp.ok) {
        const json = await resp.json();
        title = sanitizeTitle(json?.choices?.[0]?.message?.content);
      } else {
        const errTxt = await resp.text().catch(() => '');
        console.warn('[title] 上游错误', resp.status, errTxt);
      }
    } catch (e) {
      console.warn('[title] 请求失败:', e.message);
    }

    if (!title) title = fallbackTitle(trimmed);
    res.json({ title });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
