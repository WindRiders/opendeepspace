"use client";

import { useState } from "react";
import {
  Brain, Wrench, CheckCircle2, ChevronDown, ChevronRight,
  FileText, FolderOpen, Terminal, Clock,
} from "lucide-react";
import type { ExecutionStep } from "../lib/types";

function toolIcon(name: string) {
  if (name === "write_file") return <FileText className="w-3 h-3" />;
  if (name === "list_files") return <FolderOpen className="w-3 h-3" />;
  return <Terminal className="w-3 h-3" />;
}

function StepNode({ step, isLast }: { step: ExecutionStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasTools = step.tools.length > 0;

  const statusColor =
    step.status === "thinking"
      ? "bg-amber-400/80 shadow-amber-400/40 animate-pulse"
      : step.status === "tool_running"
      ? "bg-blue-400/80 shadow-blue-400/40 animate-pulse"
      : "bg-emerald-400/80 shadow-emerald-400/40";

  const durationMs = step.endTime
    ? step.endTime - step.startTime
    : Date.now() - step.startTime;

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-lg ${statusColor}`} />
        {!isLast && <div className="w-px flex-1 bg-zinc-700/50 mt-1" />}
      </div>

      {/* Content */}
      <div className="pb-3 min-w-0 flex-1 -mt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
            Step {step.step}
          </span>
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
          {step.status === "thinking" && (
            <Brain className="w-3 h-3 text-amber-400 animate-pulse" />
          )}
          {step.status === "complete" && (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          )}
        </div>

        {step.thinkingText && (
          <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{step.thinkingText}</p>
        )}

        {hasTools && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 mt-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Wrench className="w-3 h-3" />
            {step.tools.length} tool call{step.tools.length > 1 ? "s" : ""}
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}

        {expanded && hasTools && (
          <div className="mt-2 space-y-2 pl-2 border-l border-indigo-500/20">
            {step.tools.map((tc, i) => (
              <div key={i} className="text-[11px]">
                <div className="flex items-center gap-1.5 text-indigo-300">
                  {toolIcon(tc.toolName)}
                  <span className="font-medium font-mono">{tc.toolName}</span>
                  {tc.status === "running" && (
                    <span className="text-blue-400 animate-pulse">running...</span>
                  )}
                  {tc.durationMs !== undefined && (
                    <span className="text-zinc-600 ml-auto">{tc.durationMs}ms</span>
                  )}
                </div>
                <p className="text-zinc-500 font-mono text-[10px] mt-0.5 break-all">
                  {JSON.stringify(tc.args, null, 0).substring(0, 200)}
                </p>
                {tc.result && (
                  <p className="text-emerald-500/70 font-mono text-[10px] mt-0.5 break-all">
                    {tc.result.substring(0, 200)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExecutionTimeline({ steps }: { steps: ExecutionStep[] }) {
  const [show, setShow] = useState(false);

  if (!steps || steps.length === 0) return null;

  // Only show timeline if there were multiple steps or tool calls
  const hasInterestingContent = steps.length > 1 || steps.some((s) => s.tools.length > 0);
  if (!hasInterestingContent) return null;

  return (
    <div className="mt-2 rounded-lg border border-zinc-800/50 bg-zinc-950/40 overflow-hidden">
      <button
        onClick={() => setShow(!show)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900/50 transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span className="font-medium">
          Execution Timeline
        </span>
        <span className="text-zinc-600">
          {steps.length} step{steps.length > 1 ? "s" : ""} ·{" "}
          {steps.reduce((sum, s) => sum + s.tools.length, 0)} tool calls
        </span>
        {show ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      {show && (
        <div className="border-t border-zinc-800/40 px-3 py-3">
          {steps.map((step, i) => (
            <StepNode key={step.step} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
