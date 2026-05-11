import React, { useState, useRef, useCallback, useEffect } from 'react';
import ChatWindow from './components/ChatWindow.jsx';
import InputBox from './components/InputBox.jsx';
import Sidebar from './components/Sidebar.jsx';
import convStore from './store/conversations.js';

const API_BASE = 'http://localhost:3001';

const DEFAULT_SYSTEM =
  '你是一个友好、专业的桌面 AI 助手。当用户需要查询天气等实时信息时，请主动使用提供的工具获取真实数据，而不要凭空编造。回答使用简洁清晰的中文 Markdown。';

const GLOBAL_SYSTEM_KEY = 'desktop-ai-default-system';

/**
 * Message 结构：
 *   { role: 'user'|'assistant', content: string, toolCalls?: [...], createdAt? }
 */
export default function App() {
  const [conversations, setConversations] = useState([]); // 列表（不含 messages）
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [system, setSystem] = useState(DEFAULT_SYSTEM); // 当前会话的 system
  const [defaultSystem, setDefaultSystem] = useState(() => {
    try {
      return localStorage.getItem(GLOBAL_SYSTEM_KEY) || DEFAULT_SYSTEM;
    } catch {
      return DEFAULT_SYSTEM;
    }
  });

  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [booting, setBooting] = useState(true);

  const abortRef = useRef(null);
  // 用 ref 缓存最新值，避免闭包问题
  const activeIdRef = useRef(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // ===== 启动：加载会话列表 + 选定/创建活跃会话 =====
  useEffect(() => {
    (async () => {
      try {
        const list = await convStore.list();
        let activeId = await convStore.getActiveId();
        if (!activeId || !list.find((c) => c.id === activeId)) {
          activeId = list[0]?.id || null;
        }
        if (!activeId) {
          // 一个都没有 → 创建首个会话
          const created = await convStore.create({
            system: defaultSystem,
            title: '新对话'
          });
          const newList = await convStore.list();
          setConversations(newList);
          setActiveId(created.id);
          setMessages([]);
          setSystem(created.system || defaultSystem);
        } else {
          await convStore.setActiveId(activeId);
          setConversations(list);
          setActiveId(activeId);
          const conv = await convStore.get(activeId);
          setMessages(conv?.messages || []);
          setSystem(conv?.system || defaultSystem);
        }
      } catch (e) {
        console.error('[boot] 加载会话失败', e);
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshList = useCallback(async () => {
    const list = await convStore.list();
    setConversations(list);
  }, []);

  // ===== 切换会话 =====
  const handleSelect = useCallback(
    async (id) => {
      if (loading || id === activeId) return;
      const conv = await convStore.get(id);
      if (!conv) return;
      await convStore.setActiveId(id);
      setActiveId(id);
      setMessages(conv.messages || []);
      setSystem(conv.system || defaultSystem);
    },
    [loading, activeId, defaultSystem]
  );

  // ===== 新建会话 =====
  const handleNew = useCallback(async () => {
    if (loading) return;
    const created = await convStore.create({
      system: defaultSystem,
      title: '新对话'
    });
    setActiveId(created.id);
    setMessages([]);
    setSystem(created.system || defaultSystem);
    await refreshList();
  }, [loading, defaultSystem, refreshList]);

  // ===== 重命名 =====
  const handleRename = useCallback(
    async (id, title) => {
      await convStore.update(id, { title, titleGenerated: true });
      await refreshList();
    },
    [refreshList]
  );

  // ===== 删除 =====
  const handleDelete = useCallback(
    async (id) => {
      if (loading) return;
      const ok = window.confirm('确定删除这个会话吗？删除后无法恢复。');
      if (!ok) return;
      await convStore.remove(id);
      const list = await convStore.list();
      setConversations(list);
      if (id === activeId) {
        if (list.length === 0) {
          // 没有会话了 → 自动建一个
          const created = await convStore.create({
            system: defaultSystem,
            title: '新对话'
          });
          setActiveId(created.id);
          setMessages([]);
          setSystem(created.system || defaultSystem);
          await refreshList();
        } else {
          const next = list[0];
          await convStore.setActiveId(next.id);
          setActiveId(next.id);
          const conv = await convStore.get(next.id);
          setMessages(conv?.messages || []);
          setSystem(conv?.system || defaultSystem);
        }
      }
    },
    [loading, activeId, defaultSystem, refreshList]
  );

  // ===== 导出 Markdown =====
  const handleExport = useCallback(async (id) => {
    const r = await convStore.exportMarkdown(id);
    if (r?.ok) {
      // 简单提示一下
      console.log('[export] saved to', r.path);
    } else if (r && !r.canceled && r.error) {
      window.alert('导出失败：' + r.error);
    }
  }, []);

  // ===== 默认 system 修改（设置面板）=====
  const handleDefaultSystemChange = (v) => {
    setDefaultSystem(v);
    try {
      localStorage.setItem(GLOBAL_SYSTEM_KEY, v);
    } catch {}
    // 当前会话如果没有自定义过 system，也同步更新
    if (activeId) {
      // 这里我们让"全局值"直接覆盖当前会话的 system，使其符合"对所有会话生效"的语义
      setSystem(v);
      convStore.update(activeId, { system: v }).then(refreshList);
    }
  };

  // ===== 持久化辅助：节流写入 assistant 流式内容 =====
  const lastFlushRef = useRef(0);
  const pendingPatchRef = useRef(null);
  const flushAssistant = useCallback((id, msgIndex, patch, force = false) => {
    pendingPatchRef.current = { id, msgIndex, patch };
    const now = Date.now();
    if (force || now - lastFlushRef.current > 400) {
      lastFlushRef.current = now;
      const p = pendingPatchRef.current;
      pendingPatchRef.current = null;
      convStore.updateMessage(p.id, p.msgIndex, p.patch).catch(() => {});
    }
  }, []);

  // ===== 发送消息（带流式 + 持久化）=====
  const handleSend = useCallback(
    async (text) => {
      if (!text.trim() || loading) return;
      if (!activeId) return;

      const convId = activeId;
      const userMsg = { role: 'user', content: text, createdAt: Date.now() };
      const assistantMsg = {
        role: 'assistant',
        content: '',
        toolCalls: [],
        createdAt: Date.now()
      };

      // 1) 先入库 user，再入库占位 assistant
      await convStore.appendMessage(convId, userMsg);
      await convStore.appendMessage(convId, assistantMsg);

      // 2) UI 同步
      const baseMessages = [...messages, userMsg, assistantMsg];
      setMessages(baseMessages);
      // assistant 在数组里的下标
      const assistantIndex = baseMessages.length - 1;

      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;

      // 后端只关心 role/content
      const sendable = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content
      }));

      let assistantText = '';
      let toolCalls = [];

      const updateLast = (patch) => {
        // 仅当当前会话仍是发送时的会话才更新 UI
        if (activeIdRef.current !== convId) return;
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1] || {};
          copy[copy.length - 1] = { ...last, ...patch };
          return copy;
        });
      };

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
                  flushAssistant(convId, assistantIndex, {
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
                  flushAssistant(
                    convId,
                    assistantIndex,
                    { content: assistantText, toolCalls: [...toolCalls] },
                    true
                  );
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
                  flushAssistant(
                    convId,
                    assistantIndex,
                    { content: assistantText, toolCalls: [...toolCalls] },
                    true
                  );
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
          assistantText =
            (assistantText || '') +
            `\n\n❌ 出错了：${err.message}\n\n请检查后端服务与 API Key。`;
          updateLast({
            role: 'assistant',
            content: assistantText,
            toolCalls: [...toolCalls]
          });
        }
      } finally {
        // 强制把最终内容落库
        await convStore
          .updateMessage(convId, assistantIndex, {
            content: assistantText,
            toolCalls
          })
          .catch(() => {});

        setLoading(false);
        abortRef.current = null;
        await refreshList();

        // 标题自动生成：assistant 消息有内容、且尚未生成过
        try {
          const conv = await convStore.get(convId);
          if (
            conv &&
            !conv.titleGenerated &&
            (conv.messages || []).length >= 2 &&
            assistantText.trim().length > 0
          ) {
            const r = await fetch(`${API_BASE}/api/title`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: conv.messages.slice(0, 4).map((m) => ({
                  role: m.role,
                  content: m.content
                }))
              })
            });
            if (r.ok) {
              const { title } = await r.json();
              if (title) {
                await convStore.update(convId, {
                  title,
                  titleGenerated: true
                });
                await refreshList();
              }
            }
          }
        } catch (e) {
          // 标题生成失败不影响主流程
        }
      }
    },
    [messages, loading, system, activeId, refreshList, flushAssistant]
  );

  const handleStop = () => abortRef.current?.abort();
  const handleClear = async () => {
    if (loading || !activeId) return;
    if (!window.confirm('清空当前会话的所有消息？')) return;
    await convStore.update(activeId, { messages: [] });
    setMessages([]);
    await refreshList();
  };

  return (
    <div className="app app-with-sidebar">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={handleDelete}
        onExport={handleExport}
        loading={loading}
      />
      <div className="app-main">
        <header className="app-header">
          <div className="title">
            <span className="logo">🤖</span>
            <span>桌面 AI 助手</span>
          </div>
          <div className="actions">
            <button onClick={() => setShowSettings((v) => !v)} title="设置">
              ⚙️
            </button>
            <button
              onClick={handleClear}
              disabled={loading || messages.length === 0}
              title="清空当前会话"
            >
              🗑️
            </button>
          </div>
        </header>

        {showSettings && (
          <div className="settings-panel">
            <label>默认 System Prompt（对所有会话生效）</label>
            <textarea
              value={defaultSystem}
              onChange={(e) => handleDefaultSystemChange(e.target.value)}
              rows={4}
              placeholder="设定 AI 助手的角色与说话风格..."
            />
            <p className="hint">
              修改后会同步更新当前会话；新建会话时也会以此为初始值。
            </p>
          </div>
        )}

        {booting ? (
          <div className="empty">
            <div className="empty-emoji">⏳</div>
            <div className="empty-title">正在加载会话...</div>
          </div>
        ) : (
          <ChatWindow messages={messages} loading={loading} />
        )}
        <InputBox onSend={handleSend} onStop={handleStop} loading={loading} />
      </div>
    </div>
  );
}
