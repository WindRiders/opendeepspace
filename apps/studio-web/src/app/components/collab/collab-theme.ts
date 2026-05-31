import type { AgentRole } from "@deepspace/shared-types";

export const ROLE_COLORS: Record<AgentRole, string> = {
  planner: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  coder: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  reviewer: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  researcher: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

export const FROM_COLORS: Record<string, string> = {
  orchestrator: "border-l-purple-500",
  planner: "border-l-amber-500",
  coder: "border-l-blue-500",
  reviewer: "border-l-rose-500",
  researcher: "border-l-emerald-500",
  user: "border-l-zinc-400",
};