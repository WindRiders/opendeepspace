"use client";

import { Star, User, Clock, Download } from "lucide-react";
import type { MarketplaceAgent } from "@deepspace/shared-types";
import { timeAgo } from "../lib/utils";

interface AgentCardProps {
  agent: MarketplaceAgent;
  onSelect: (agent: MarketplaceAgent) => void;
  onStar: (id: string, e: React.MouseEvent) => void;
  onDownload: (id: string, e: React.MouseEvent) => void;
}

export function AgentCard({ agent, onSelect, onStar, onDownload }: AgentCardProps) {
  return (
    <div
      onClick={() => onSelect(agent)}
      className="group bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 hover:border-purple-500/30 hover:bg-zinc-900/60 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-purple-300 transition-colors">
          {agent.name}
        </h3>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => onDownload(agent.id, e)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
            title="下载"
          >
            <Download className="w-3 h-3" />
            {agent.downloads}
          </button>
          <button
            onClick={(e) => onStar(agent.id, e)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
          >
            <Star className={`w-3 h-3 ${agent.stars > 0 ? "fill-amber-400 text-amber-400" : ""}`} />
            {agent.stars}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-3 line-clamp-2 leading-relaxed">
        {agent.description}
      </p>
      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <User className="w-2.5 h-2.5" />
          {agent.author}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {timeAgo(agent.createdAt)}
        </span>
      </div>
      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-400/70 border border-purple-500/10"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}