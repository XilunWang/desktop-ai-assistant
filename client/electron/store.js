/**
 * 会话持久化存储（基于 electron-store）
 *
 * 数据结构：
 * {
 *   version: 1,
 *   activeId: string|null,
 *   conversations: [
 *     {
 *       id, title, titleGenerated,
 *       system,
 *       createdAt, updatedAt,
 *       messages: [{ role, content, toolCalls?, createdAt }]
 *     }
 *   ]
 * }
 *
 * 暴露为同步函数；外层在 ipcMain.handle 里包一层即可。
 */
const Store = require('electron-store');

const store = new Store({
  name: 'conversations',
  defaults: {
    version: 1,
    activeId: null,
    conversations: []
  }
});

function genId() {
  return (
    'conv_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

function now() {
  return Date.now();
}

function getAll() {
  return store.get('conversations') || [];
}

function setAll(list) {
  store.set('conversations', list);
}

function findIndex(id) {
  return getAll().findIndex((c) => c.id === id);
}

/** 列表（不含 messages，给侧边栏用） */
function list() {
  return getAll()
    .map((c) => ({
      id: c.id,
      title: c.title,
      titleGenerated: !!c.titleGenerated,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: Array.isArray(c.messages) ? c.messages.length : 0
    }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** 单条详情 */
function get(id) {
  const list = getAll();
  return list.find((c) => c.id === id) || null;
}

function getActiveId() {
  return store.get('activeId') || null;
}

function setActiveId(id) {
  store.set('activeId', id);
  return id;
}

/** 创建一个新会话；可指定初始 system / title */
function create({ system = '', title = '新对话' } = {}) {
  const conv = {
    id: genId(),
    title,
    titleGenerated: false,
    system,
    createdAt: now(),
    updatedAt: now(),
    messages: []
  };
  const list = getAll();
  list.unshift(conv);
  setAll(list);
  setActiveId(conv.id);
  return conv;
}

/** 局部更新（title / system / messages / titleGenerated 等） */
function update(id, patch = {}) {
  const list = getAll();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const allow = ['title', 'system', 'messages', 'titleGenerated'];
  const next = { ...list[idx] };
  for (const k of allow) {
    if (k in patch) next[k] = patch[k];
  }
  next.updatedAt = now();
  list[idx] = next;
  setAll(list);
  return next;
}

/** 追加单条消息 */
function appendMessage(id, message) {
  const list = getAll();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const conv = list[idx];
  const msg = { ...message, createdAt: message.createdAt || now() };
  conv.messages = Array.isArray(conv.messages) ? [...conv.messages, msg] : [msg];
  conv.updatedAt = now();
  list[idx] = conv;
  setAll(list);
  return conv;
}

/** 替换某条消息（按数组下标） */
function updateMessage(id, index, patch) {
  const list = getAll();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const conv = list[idx];
  if (!Array.isArray(conv.messages) || index < 0 || index >= conv.messages.length) {
    return null;
  }
  conv.messages = conv.messages.map((m, i) =>
    i === index ? { ...m, ...patch } : m
  );
  conv.updatedAt = now();
  list[idx] = conv;
  setAll(list);
  return conv;
}

function remove(id) {
  const list = getAll();
  const next = list.filter((c) => c.id !== id);
  setAll(next);
  if (getActiveId() === id) {
    setActiveId(next[0]?.id || null);
  }
  return true;
}

/** 导出为 Markdown 文本 */
function toMarkdown(id) {
  const conv = get(id);
  if (!conv) return '';
  const lines = [];
  lines.push(`# ${conv.title || '未命名会话'}`);
  lines.push('');
  lines.push(`> 创建于 ${new Date(conv.createdAt).toLocaleString()}`);
  lines.push(`> 更新于 ${new Date(conv.updatedAt).toLocaleString()}`);
  if (conv.system) {
    lines.push('');
    lines.push('## System Prompt');
    lines.push('');
    lines.push('```');
    lines.push(conv.system);
    lines.push('```');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const m of conv.messages || []) {
    if (m.role === 'user') {
      lines.push(`### 🧑 用户`);
    } else if (m.role === 'assistant') {
      lines.push(`### 🤖 助手`);
    } else {
      lines.push(`### ${m.role}`);
    }
    lines.push('');
    if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
      for (const tc of m.toolCalls) {
        lines.push(
          `> 🔧 调用工具 \`${tc.name}\`${tc.isError ? '（失败）' : ''}`
        );
        if (tc.args) {
          lines.push('```json');
          lines.push(JSON.stringify(tc.args, null, 2));
          lines.push('```');
        }
        if (tc.result) {
          lines.push('```');
          lines.push(String(tc.result));
          lines.push('```');
        }
      }
      lines.push('');
    }
    lines.push(m.content || '');
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  list,
  get,
  getActiveId,
  setActiveId,
  create,
  update,
  appendMessage,
  updateMessage,
  remove,
  toMarkdown
};
