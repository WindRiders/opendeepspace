"use client";

import { useState } from "react";
import { Wrench, ChevronDown, ChevronRight, FileText, FolderOpen, Terminal } from "lucide-react";
import type { ToolCall } from "../lib/types";

export function ToolCallPanel({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  const toolIcon = (name: string) => {
    if (name === "write_file") return <FileText className="w-3 h-3" />;
    if (name === "list_files") return <FolderOpen className="w-3 h-3" />;
    return <Terminal className="w-3 h-3" />;
  };

  return (
    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-300 hover:bg-purple-950/40 transition-colors"
      >
        <Wrench className="w-3 h-3" />
        <span className="font-medium">
          已执行 {toolCalls.length} 个工具调用
        </span>
        {expanded ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="border-t border-purple-500/10 px-3 py-2 space-y-3">
          {toolCalls.map((tc, i) => (
            <div key={i} className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-purple-800/50 text-purple-300 font-mono text-[10px]">
                  Step {tc.step}
                </span>
                <span className="font-medium text-purple-200 flex items-center gap-1">
                  {toolIcon(tc.toolName)}
                  {tc.toolName}
                </span>
              </div>
              <div className="pl-3 border-l border-purple-500/20">
                <p className="text-zinc-400 font-mono text-[11px] break-all">
                  Args: {JSON.stringify(tc.args, null, 0).substring(0, 300)}
                </p>
                <p className="text-green-400/70 font-mono text-[11px] mt-1 break-all">
                  → {tc.result.substring(0, 300)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
