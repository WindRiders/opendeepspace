"use client";

import { Cpu, User } from "lucide-react";
import type { Message } from "../lib/types";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolCallPanel } from "./ToolCallPanel";
import { ExecutionTimeline } from "./ExecutionTimeline";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ChatMessage({ msg }: { msg: Message }) {
  return (
    <div
      className={`flex gap-3 max-w-4xl ${
        msg.role === "user" ? "ml-auto flex-row-reverse" : ""
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          msg.role === "user"
            ? "bg-zinc-800"
            : "bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/20"
        }`}
      >
        {msg.role === "user" ? (
          <User className="w-4 h-4 text-zinc-400" />
        ) : (
          <Cpu className="w-4 h-4 text-purple-400" />
        )}
      </div>
      <div
        className={`flex flex-col gap-1 min-w-0 max-w-[90%] lg:max-w-[85%] ${
          msg.role === "user" ? "items-end" : "items-start"
        }`}
      >
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
            {msg.role === "user" ? "You" : "Entity"}
          </span>
          {msg.totalSteps && msg.totalSteps > 1 && (
            <span className="text-[10px] text-zinc-600">
              {msg.totalSteps} steps
            </span>
          )}
          <span className="text-[10px] text-zinc-700">{formatTime(msg.timestamp)}</span>
        </div>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            msg.role === "user"
              ? "bg-zinc-800/80 text-zinc-200 rounded-tr-sm"
              : msg.error
              ? "bg-red-950/30 border border-red-500/20 text-red-300 rounded-tl-sm"
              : "bg-zinc-900/60 border border-zinc-800/50 text-zinc-300 rounded-tl-sm"
          }`}
        >
          {msg.role === "agent" && !msg.error ? (
            <MarkdownMessage content={msg.content} />
          ) : (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          )}
        </div>
        {msg.executionSteps && msg.executionSteps.length > 0 ? (
          <ExecutionTimeline steps={msg.executionSteps} />
        ) : (
          msg.toolCalls && <ToolCallPanel toolCalls={msg.toolCalls} />
        )}
      </div>
    </div>
  );
}
