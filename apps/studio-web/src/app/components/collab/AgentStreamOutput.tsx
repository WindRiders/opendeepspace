"use client";

import { Loader2, CheckCircle } from "lucide-react";
import type { AgentRole } from "@deepspace/shared-types";
import { ROLE_COLORS, FROM_COLORS } from "./collab-theme";

interface AgentStreamState {
  agentRole: string;
  agentName: string;
  content: string;
  done: boolean;
}

export function AgentStreamOutput({
  agentStreams,
}: {
  agentStreams: Map<string, AgentStreamState>;
}) {
  return (
    <>
      {Array.from(agentStreams.values()).map((s) => {
        return (
          <div
            key={s.agentRole}
            className={`border-l-2 pl-3 py-2 ${
              FROM_COLORS[s.agentRole] || "border-l-zinc-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  ROLE_COLORS[s.agentRole as AgentRole] || ""
                }`}
              >
                {s.agentName}
              </span>
              {!s.done && (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
              )}
              {s.done && (
                <CheckCircle className="w-3 h-3 text-green-500" />
              )}
            </div>
            <p className="text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {s.content}
            </p>
          </div>
        );
      })}
    </>
  );
}