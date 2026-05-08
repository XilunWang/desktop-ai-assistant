import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

export default function ChatWindow({ messages, loading }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="chat-window" ref={scrollRef}>
      {messages.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">💬</div>
          <div className="empty-title">开始与 AI 对话</div>
        </div>
      ) : (
        messages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            content={m.content}
            toolCalls={m.toolCalls}
            isStreaming={loading && i === messages.length - 1 && m.role === 'assistant'}
          />
        ))
      )}
    </div>
  );
}
