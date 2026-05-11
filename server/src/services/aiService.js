/**
 * AI 服务 - 支持 Agent Loop（function/tool calling）
 * 协议：OpenAI Chat Completions + tools
 *
 * 流程：
 *   1. 发请求带上 tools
 *   2. 流式接收 delta：
 *      - delta.content 直接转发到前端（流式文本）
 *      - delta.tool_calls 累积参数
 *   3. 一轮结束后若产生 tool_calls：
 *      a) 把 assistant 的 tool_calls 消息加入历史
 *      b) 依次执行每个工具，把结果作为 role:'tool' 消息追加
 *      c) 用更新后的历史再发一轮（继续循环）
 *   4. 没有 tool_calls 则结束
 */

const mcp = require('./mcpManager');

const MAX_ROUNDS = 6; // 防止死循环

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

/**
 * 一次流式请求 + 解析，返回 { contentText, toolCalls, aborted }
 * onDelta：每收到一段文本就调用
 * signal：AbortSignal，用于打断上游 fetch 与读流
 */
async function streamOnce({ model, messages, tools, onDelta, signal }) {
  const cfg = getConfig();
  const url = `${cfg.baseURL}/chat/completions`;
  const body = {
    model: model || cfg.model,
    messages,
    stream: true
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) {
      return { contentText: '', toolCalls: [], aborted: true };
    }
    throw e;
  }

  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => '');
    throw new Error(`AI 接口错误 ${resp.status}: ${t}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  let contentText = '';
  // toolCalls: [{id, name, arguments(string)}]
  const toolCalls = [];
  let aborted = false;

  // 中止时主动断流（让 reader.read() 立刻 reject）
  const onAbort = () => {
    try {
      reader.cancel();
    } catch (e) {
      /* ignore */
    }
  };
  signal?.addEventListener?.('abort', onAbort);

  try {
    while (true) {
      if (signal?.aborted) {
        aborted = true;
        break;
      }
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') {
          aborted = true;
          break;
        }
        throw e;
      }
      const { value, done } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const choice = json?.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta || {};

            if (delta.content) {
              contentText += delta.content;
              onDelta?.(delta.content);
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: '', name: '', arguments: '' };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments)
                  toolCalls[idx].arguments += tc.function.arguments;
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
  }

  return { contentText, toolCalls: toolCalls.filter(Boolean), aborted };
}

/**
 * Agent Loop（带工具调用循环）
 * onText(text)         : LLM 输出的文本片段
 * onToolStart({name, args})
 * onToolEnd({name, args, result, isError})
 * signal               : AbortSignal，可中止整个 Agent 流程
 * 返回值: { aborted: boolean }
 */
async function chatAgent({
  model,
  messages,
  onText,
  onToolStart,
  onToolEnd,
  signal
}) {
  const tools = mcp.hasAnyTool() ? mcp.getOpenAITools() : null;
  const history = [...messages];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return { aborted: true };

    const { contentText, toolCalls, aborted } = await streamOnce({
      model,
      messages: history,
      tools,
      onDelta: onText,
      signal
    });

    if (aborted || signal?.aborted) {
      return { aborted: true };
    }

    if (toolCalls.length === 0) {
      // 没有工具调用 → 结束
      return { aborted: false };
    }

    // 把 assistant 的 tool_calls 消息加入历史
    history.push({
      role: 'assistant',
      content: contentText || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments || '{}' }
      }))
    });

    // 依次执行
    for (const tc of toolCalls) {
      if (signal?.aborted) return { aborted: true };

      let parsedArgs = {};
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch (e) {
        parsedArgs = { _raw: tc.arguments };
      }

      onToolStart?.({ id: tc.id, name: tc.name, args: parsedArgs });

      let resultText = '';
      let isError = false;
      try {
        const r = await mcp.callTool(tc.name, parsedArgs);
        resultText = r.text;
        isError = r.isError;
      } catch (e) {
        resultText = `工具执行失败: ${e.message}`;
        isError = true;
      }

      onToolEnd?.({
        id: tc.id,
        name: tc.name,
        args: parsedArgs,
        result: resultText,
        isError
      });

      history.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultText
      });
    }

    if (signal?.aborted) return { aborted: true };
    // 进入下一轮
  }

  // 触顶仍未停止
  onText?.('\n\n（已达最大工具调用轮次）');
  return { aborted: false };
}

module.exports = { chatAgent };
