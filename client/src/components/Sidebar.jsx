import React, { useState, useRef, useEffect } from 'react';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (isYest) return '昨天';
  if (today.getFullYear() === d.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onExport,
  loading
}) {
  const [menuFor, setMenuFor] = useState(null); // 当前打开菜单的会话 id
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);

  useEffect(() => {
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = (conv) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title || '');
    setMenuFor(null);
  };

  const submitRename = () => {
    const title = renameValue.trim();
    if (renamingId && title) {
      onRename?.(renamingId, title);
    }
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          className="sidebar-new"
          onClick={onNew}
          disabled={loading}
          title="新建对话"
        >
          ＋ 新建对话
        </button>
      </div>
      <div className="sidebar-list">
        {conversations.length === 0 && (
          <div className="sidebar-empty">还没有会话，点上方新建一个吧</div>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          const isRenaming = c.id === renamingId;
          return (
            <div
              key={c.id}
              className={
                'sidebar-item' + (isActive ? ' active' : '')
              }
              onClick={() => !isRenaming && onSelect?.(c.id)}
            >
              <div className="sidebar-item-main">
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="sidebar-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={submitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      else if (e.key === 'Escape') {
                        setRenamingId(null);
                        setRenameValue('');
                      }
                    }}
                    maxLength={32}
                  />
                ) : (
                  <div className="sidebar-item-title" title={c.title}>
                    {c.title || '未命名会话'}
                  </div>
                )}
                <div className="sidebar-item-meta">
                  <span>{formatTime(c.updatedAt)}</span>
                  {c.messageCount > 0 && (
                    <span className="sidebar-item-count">{c.messageCount}</span>
                  )}
                </div>
              </div>
              <div
                className="sidebar-item-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="sidebar-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === c.id ? null : c.id);
                  }}
                  title="更多"
                >
                  ⋯
                </button>
                {menuFor === c.id && (
                  <div className="sidebar-menu" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        startRename(c);
                      }}
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => {
                        setMenuFor(null);
                        onExport?.(c.id);
                      }}
                    >
                      导出 Markdown
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setMenuFor(null);
                        onDelete?.(c.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
