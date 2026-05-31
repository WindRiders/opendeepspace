"use client";

import { Star, X, User, Clock, Tag, Sparkles } from "lucide-react";
import type { MarketplaceAgent } from "@deepspace/shared-types";
import { timeAgo } from "../lib/utils";

interface AgentDetailModalProps {
  agent: MarketplaceAgent;
  onClose: () => void;
  onStar: (id: string, e: React.MouseEvent) => void;
  onToast: (msg: string) => void;
}

export function AgentDetailModal({ agent, onClose, onStar, onToast }: AgentDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-2xl max-h-[85vh] bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/50">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-200">{agent.name}</h3>
          <button
            onClick={(e) => onStar(agent.id, e)}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
          >
            <Star className={`w-3 h-3 ${agent.stars > 0 ? "fill-amber-400 text-amber-400" : ""}`} />
            {agent.stars}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Description</label>
            <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{agent.description}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {agent.author}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(agent.createdAt)}
            </span>
            {agent.modelId && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {agent.modelId}
              </span>
            )}
          </div>
          {agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400/70 border border-purple-500/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Agent DNA
            </label>
            <pre className="mt-1 p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-xl text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {agent.dna}
            </pre>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-800/50">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(agent.dna);
              onToast("DNA 已复制到剪贴板");
            }}
            className="w-full px-4 py-2.5 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 transition-colors text-sm font-medium"
          >
            复制 DNA 并使用
          </button>
        </div>
      </div>
    </div>
  );
}