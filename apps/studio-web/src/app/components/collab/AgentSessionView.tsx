"use client";

import { Loader2, Play, Wifi, WifiOff, ArrowRight } from "lucide-react";
import type {
  CollabMessage,
  CollabSession,
} from "@deepspace/shared-types";
import { AgentStreamOutput } from "./AgentStreamOutput";
import { ROLE_COLORS, FROM_COLORS } from "./collab-theme";

function MessageBubble({ msg }: { msg: CollabMessage }) {
  const borderColor = FROM_COLORS[msg.from] || "border-l-zinc-600";
  return (
    <div className={`border-l-2 ${borderColor} pl-3 py-1.5`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase">
          {msg.from}
        </span>
        <ArrowRight className="w-2.5 h-2.5 text-zinc-700" />
        <span className="text-[10px] text-zinc-500">{msg.to}</span>
        <span className="ml-auto text-[9px] text-zinc-700">{msg.type}</span>
      </div>
      <p className="text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {msg.content}
      </p>
    </div>
  );
}

interface AgentStreamState {
  agentRole: string;
  agentName: string;
  content: string;
  done: boolean;
}

export function AgentSessionView({
  session,
  allMessages,
  agentStreams,
  typingAgent,
  executing,
  execError,
  connected,
  onlineCount,
  onExecute,
  onReset,
}: {
  session: CollabSession;
  allMessages: CollabMessage[];
  agentStreams: Map<string, AgentStreamState>;
  typingAgent: string | null;
  executing: boolean;
  execError: string | null;
  connected: boolean;
  onlineCount: number;
  onExecute: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Task banner */}
      <div className="px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/30">
        <p className="text-xs text-zinc-400 truncate">
          <span className="text-zinc-600">Task:</span> {session.task}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {session.agents.map((a) => (
            <span
              key={a}
              className={`px-2 py-0.5 rounded-full text-[9px] font-medium border ${
                ROLE_COLORS[a] || ""
              }`}
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <AgentStreamOutput agentStreams={agentStreams} />

        {typingAgent && (
          <div className="flex items-center gap-2 text-[10px] text-zinc-600 animate-pulse pl-3">
            <span className="font-medium text-zinc-500">{typingAgent}</span>
            <span>is typing...</span>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/50">
        <button
          onClick={onExecute}
          disabled={executing || session.status === "complete"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {executing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Executing...
            </>
          ) : execError ? (
            <>
              <Play className="w-3 h-3" />
              Retry
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Execute
            </>
          )}
        </button>
        {execError && (
          <span className="text-[10px] text-red-400/80 truncate max-w-[200px]">
            {execError}
          </span>
        )}
        <button
          onClick={onReset}
          className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        >
          New Collaboration
        </button>
      </div>
    </div>
  );
}