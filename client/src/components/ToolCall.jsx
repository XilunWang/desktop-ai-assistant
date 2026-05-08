import React, { useState } from 'react';

export default function ToolCall({ name, args, result, isError, running }) {
  const [open, setOpen] = useState(false);

  const status = running ? '⏳ 调用中' : isError ? '❌ 失败' : '✅ 完成';

  return (
    <div className={`tool-call ${isError ? 'error' : ''} ${running ? 'running' : ''}`}>
      <div className="tool-call-header" onClick={() => setOpen((v) => !v)}>
        <span className="tool-icon">🔧</span>
        <span className="tool-name">{name}</span>
        <span className="tool-status">{status}</span>
        <span className="tool-toggle">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="tool-call-body">
          <div className="tool-section">
            <div className="tool-label">参数</div>
            <pre className="tool-pre">{JSON.stringify(args, null, 2)}</pre>
          </div>
          {!running && (
            <div className="tool-section">
              <div className="tool-label">结果</div>
              <pre className="tool-pre">{result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
