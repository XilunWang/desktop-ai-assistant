import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code className="md-inline-code" {...props}>
        {children}
      </code>
    );
  }

  const langMatch = /language-(\w+)/.exec(className || '');
  const lang = langMatch ? langMatch[1] : 'text';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="md-code-wrap">
      <div className="md-code-header">
        <span className="md-code-lang">{lang}</span>
        <button className="md-code-copy" onClick={onCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="md-code-pre">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

const components = {
  code: CodeBlock,
  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: (props) => (
    <div className="md-table-wrap">
      <table {...props} />
    </div>
  )
};

export default function Markdown({ content }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
