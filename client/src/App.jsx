import React, { useState, useRef, useCallback } from 'react';
import ChatWindow from './components/ChatWindow.jsx';
import InputBox from './components/InputBox.jsx';

const API_BASE = 'http://localhost:3001';

const DEFAULT_SYSTEM =
  '你是一个友好、专业的桌面 AI 助手。当用户需要查询天气等实时信息时，请主动使用提供的工具获取真实数据，而不要凭空编造。回答使用简洁清晰的中文 Markdown。';

/**
 * Message 结构：
 *   { role: 'user'|'assistant', content: string, toolCalls?: [{id,name,args,result,isError,running}] }
 */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef(null);

  const handleSend = useCallback(
    async (text) => {
      if (!text.trim() || loading) return;

      const newMessages = [...messages, { role: 'user', content: text }];
      setMessages([
        ...newMessages,
        { role: 'assistant', content: '', toolCalls: [] }
      ]);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // 后端只关心 role/content
      const sendable = newMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      try {
        const resp = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: sendable, system }),
          signal: controller.signal
        });

        if (!resp.ok || !resp.body) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`请求失败 ${resp.status}: ${errText}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let assistantText = '';
        let toolCalls = []; // 累积

        const updateLast = (patch) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1] || {};
            copy[copy.length - 1] = { ...last, ...patch };
            return copy;
          });
        };

        while (true) {
          const { value, done } = await reader.read();
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
              if (!payload) continue;
              try {
                const json = JSON.parse(payload);

                if (json.delta) {
                  assistantText += json.delta;
                  updateLast({
                    role: 'assistant',
                    content: assistantText,
                    toolCalls: [...toolCalls]
                  });
                } else if (json.tool_start) {
                  const t = json.tool_start;
                  toolCalls = [
                    ...toolCalls,
                    {
                      id: t.id,
                      name: t.name,
                      args: t.args,
                      result: '',
                      isError: false,
                      running: true
                    }
                  ];
                  updateLast({
                    role: 'assistant',
                    content: assistantText,
                    toolCalls: [...toolCalls]
                  });
                } else if (json.tool_end) {
                  const t = json.tool_end;
                  toolCalls = toolCalls.map((tc) =>
                    tc.id === t.id
                      ? {
                          ...tc,
                          result: t.result,
                          isError: !!t.isError,
                          running: false
                        }
                      : tc
                  );
                  updateLast({
                    role: 'assistant',
                    content: assistantText,
                    toolCalls: [...toolCalls]
                  });
                } else if (json.error) {
                  throw new Error(json.error);
                }
              } catch (e) {
                if (e?.message) throw e;
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1] || {};
            copy[copy.length - 1] = {
              ...last,
              role: 'assistant',
              content:
                (last.content || '') +
                `\n\n❌ 出错了：${err.message}\n\n请检查后端服务与 API Key。`
            };
            return copy;
          });
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, loading, system]
  );

  const handleStop = () => abortRef.current?.abort();
  const handleClear = () => {
    if (loading) return;
    setMessages([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="title">
          <span className="logo">🤖</span>
          <span>桌面 AI 助手</span>
        </div>
        <div className="actions">
          <button onClick={() => setShowSettings((v) => !v)} title="设置">
            ⚙️
          </button>
          <button onClick={handleClear} disabled={loading} title="清空会话">
            🗑️
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <label>System Prompt（角色设定）</label>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            rows={4}
            placeholder="设定 AI 助手的角色与说话风格..."
          />
        </div>
      )}

      <ChatWindow messages={messages} loading={loading} />
      <InputBox onSend={handleSend} onStop={handleStop} loading={loading} />
    </div>
  );
}
