import React, { useState, useRef } from 'react';

export default function InputBox({ onSend, onStop, loading }) {
  const [text, setText] = useState('');
  const taRef = useRef(null);

  const submit = () => {
    if (!text.trim() || loading) return;
    onSend(text.trim());
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="input-box">
      <textarea
        ref={taRef}
        rows={1}
        value={text}
        onChange={onInput}
        onKeyDown={onKeyDown}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
      />
      {loading ? (
        <button className="btn stop" onClick={onStop} title="停止">
          ⏹ 停止
        </button>
      ) : (
        <button
          className="btn send"
          onClick={submit}
          disabled={!text.trim()}
          title="发送"
        >
          发送
        </button>
      )}
    </div>
  );
}
