import React from 'react';
import Markdown from './Markdown.jsx';
import ToolCall from './ToolCall.jsx';

export default function MessageBubble({ role, content, toolCalls = [], isStreaming }) {
  const isUser = role === 'user';
  const hasTools = !isUser && toolCalls && toolCalls.length > 0;

  return (
    <div className={`bubble-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? '🧑' : '🤖'}</div>
      <div className="bubble">
        <div className="bubble-content">
          {isUser ? (
            <span className="user-text">{content}</span>
          ) : (
            <>
              {hasTools && (
                <div className="tool-calls">
                  {toolCalls.map((tc) => (
                    <ToolCall key={tc.id || tc.name} {...tc} />
                  ))}
                </div>
              )}
              {content ? (
                <>
                  <Markdown content={content} />
                  {isStreaming && <span className="cursor">▍</span>}
                </>
              ) : (
                isStreaming && <span className="cursor">▍</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
