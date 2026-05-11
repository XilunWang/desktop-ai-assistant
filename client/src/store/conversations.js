/**
 * 会话存储客户端：
 * - Electron 环境下走 window.api.conv.*（IPC）
 * - 普通浏览器下降级到 localStorage（保证 vite 单独跑也能用）
 *
 * 数据结构与主进程的 store.js 保持一致。
 */

const LS_KEY = 'desktop-ai-conversations-v1';

const isElectron = () =>
  typeof window !== 'undefined' && !!window.api && !!window.api.conv;

function genId() {
  return (
    'conv_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}
const now = () => Date.now();

function readLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { activeId: null, conversations: [] };
    return JSON.parse(raw);
  } catch (e) {
    return { activeId: null, conversations: [] };
  }
}
function writeLS(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

const lsApi = {
  async list() {
    return readLS()
      .conversations.map((c) => ({
        id: c.id,
        title: c.title,
        titleGenerated: !!c.titleGenerated,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: (c.messages || []).length
      }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async get(id) {
    return readLS().conversations.find((c) => c.id === id) || null;
  },
  async getActiveId() {
    return readLS().activeId || null;
  },
  async setActiveId(id) {
    const d = readLS();
    d.activeId = id;
    writeLS(d);
    return id;
  },
  async create({ system = '', title = '新对话' } = {}) {
    const conv = {
      id: genId(),
      title,
      titleGenerated: false,
      system,
      createdAt: now(),
      updatedAt: now(),
      messages: []
    };
    const d = readLS();
    d.conversations.unshift(conv);
    d.activeId = conv.id;
    writeLS(d);
    return conv;
  },
  async update(id, patch = {}) {
    const d = readLS();
    const idx = d.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const allow = ['title', 'system', 'messages', 'titleGenerated'];
    const next = { ...d.conversations[idx] };
    for (const k of allow) if (k in patch) next[k] = patch[k];
    next.updatedAt = now();
    d.conversations[idx] = next;
    writeLS(d);
    return next;
  },
  async appendMessage(id, message) {
    const d = readLS();
    const idx = d.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const conv = d.conversations[idx];
    conv.messages = [
      ...(conv.messages || []),
      { ...message, createdAt: message.createdAt || now() }
    ];
    conv.updatedAt = now();
    d.conversations[idx] = conv;
    writeLS(d);
    return conv;
  },
  async updateMessage(id, index, patch) {
    const d = readLS();
    const idx = d.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const conv = d.conversations[idx];
    if (
      !Array.isArray(conv.messages) ||
      index < 0 ||
      index >= conv.messages.length
    ) {
      return null;
    }
    conv.messages = conv.messages.map((m, i) =>
      i === index ? { ...m, ...patch } : m
    );
    conv.updatedAt = now();
    d.conversations[idx] = conv;
    writeLS(d);
    return conv;
  },
  async remove(id) {
    const d = readLS();
    d.conversations = d.conversations.filter((c) => c.id !== id);
    if (d.activeId === id) {
      d.activeId = d.conversations[0]?.id || null;
    }
    writeLS(d);
    return true;
  },
  async exportMarkdown(_id) {
    // 浏览器环境暂不支持原生保存，前端可以自己做下载
    return { ok: false, error: 'export only available in desktop app' };
  }
};

const api = isElectron() ? window.api.conv : lsApi;

export default api;
export { isElectron };
