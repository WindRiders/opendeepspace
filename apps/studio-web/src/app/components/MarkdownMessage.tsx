"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyButton } from "./CopyButton";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, node: _, inline: __, ...props }: { className?: string; children?: React.ReactNode; inline?: boolean; node?: unknown }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <div className="relative group my-2">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/80 rounded-t-lg border-b border-zinc-700/50">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase">{match[1]}</span>
                    <CopyButton text={codeStr} />
                  </div>
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "0 0 8px 8px",
                      fontSize: "0.85em",
                      background: "rgba(0,0,0,0.4)",
                    }}
                  >
                    {codeStr}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
