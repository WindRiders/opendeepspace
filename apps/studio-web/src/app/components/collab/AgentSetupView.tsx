"use client";

import { Loader2, Plus, Code } from "lucide-react";
import type { AgentRoleConfig, AgentRole } from "@deepspace/shared-types";
import { ROLE_COLORS } from "./collab-theme";

const ROLE_ICONS: Record<string, typeof Code> = {
  "clipboard-list": Loader2,
  code: Code,
  search: Loader2,
  "book-open": Loader2,
};

export function AgentSetupView({
  roles,
  selectedRoles,
  task,
  loading,
  onToggleRole,
  onTaskChange,
  onStart,
}: {
  roles: AgentRoleConfig[];
  selectedRoles: AgentRole[];
  task: string;
  loading: boolean;
  onToggleRole: (role: AgentRole) => void;
  onTaskChange: (task: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <label className="text-xs text-zinc-500 mb-2 block">
            Describe the task for the agent team
          </label>
          <textarea
            value={task}
            onChange={(e) => onTaskChange(e.target.value)}
            placeholder="e.g. Build a user authentication system with JWT..."
            className="w-full h-24 bg-zinc-900/50 border border-zinc-800/50 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-purple-500/40 resize-none"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-2 block">
            Select agent roles
          </label>
          <div className="grid grid-cols-2 gap-2">
            {roles.map((role) => {
              const Icon = ROLE_ICONS[role.icon] || Code;
              const isSelected = selectedRoles.includes(role.role);
              const colors = ROLE_COLORS[role.role] || "";
              return (
                <button
                  key={role.role}
                  onClick={() => onToggleRole(role.role)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? `${colors} border-current`
                      : "bg-zinc-900/30 border-zinc-800/40 text-zinc-500 hover:border-zinc-700"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{role.name}</p>
                    <p className="text-[10px] opacity-60">{role.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onStart}
          disabled={!task.trim() || selectedRoles.length === 0 || loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {loading ? "Planning..." : "Start Collaboration"}
        </button>
      </div>
    </div>
  );
}