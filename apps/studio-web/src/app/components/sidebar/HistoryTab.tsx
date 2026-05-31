"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@deepspace/shared-types";
import { timeAgo } from "../../lib/utils";

interface HistoryTabProps {
  conversations: ConversationSummary[];
  currentSessionId: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export function HistoryTab({ conversations, currentSessionId, onDelete }: HistoryTabProps) {
  return (
    <div className="space-y-1">
      {conversations.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">暂无对话历史</p>
      ) : (
        conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              conv.id === currentSessionId
                ? "bg-purple-500/10 border border-purple-500/20"
                : "hover:bg-zinc-800/50"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 truncate">{conv.title}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {conv.messageCount} 条消息 · {timeAgo(conv.updatedAt)}
              </p>
            </div>
            <button
              onClick={(e) => onDelete(conv.id, e)}
              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-0.5"
              title="删除对话"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}