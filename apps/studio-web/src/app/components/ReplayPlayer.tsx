"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play, Pause, SkipForward, SkipBack, X, Clock,
  Brain, Wrench, MessageSquare, History,
} from "lucide-react";
import { fetchTraces, fetchTrace } from "../lib/trace-api";
import type { ExecutionTrace, TraceSummary, TraceStep } from "@deepspace/shared-types";

function StepBadge({ step }: { step: TraceStep }) {
  const icons: Record<string, typeof Brain> = {
    thinking: Brain,
    tool_call: Wrench,
    text: MessageSquare,
  };
  const colors: Record<string, string> = {
    thinking: "text-amber-400 bg-amber-400/10",
    tool_call: "text-blue-400 bg-blue-400/10",
    text: "text-emerald-400 bg-emerald-400/10",
  };
  const Icon = icons[step.type] || Brain;
  const color = colors[step.type] || "text-zinc-400 bg-zinc-400/10";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[11px] font-mono truncate">
        {step.type === "tool_call"
          ? `${step.toolName}(${JSON.stringify(step.toolArgs || {}).substring(0, 60)})`
          : step.type === "thinking"
            ? step.content || "Thinking..."
            : (step.content || "").substring(0, 80)}
      </span>
      {step.durationMs !== undefined && (
        <span className="ml-auto text-[9px] text-zinc-500 shrink-0">
          {step.durationMs}ms
        </span>
      )}
    </div>
  );
}

function TraceListItem({
  trace,
  onSelect,
  isSelected,
}: {
  trace: TraceSummary;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const date = new Date(trace.createdAt * 1000);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
        isSelected
          ? "bg-purple-500/15 border border-purple-500/30"
          : "hover:bg-zinc-800/50 border border-transparent"
      }`}
    >
      <p className="text-[11px] text-zinc-300 truncate">{trace.userMessage}</p>
      <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-600">
        <span>{trace.totalSteps} steps</span>
        <span>{trace.toolCount} tools</span>
        <span>{trace.durationMs}ms</span>
        <span className="ml-auto">
          {date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </button>
  );
}

export function ReplayPlayer({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
}) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<ExecutionTrace | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTraces = useCallback(async () => {
    try {
      const list = await fetchTraces(sessionId);
      setTraces(list);
      setError(null);
    } catch {
      setError("Failed to load traces");
    }
  }, [sessionId]);

  useEffect(() => {
    if (open) loadTraces();
  }, [open, loadTraces]);

  const handleSelectTrace = async (traceId: string) => {
    try {
      const trace = await fetchTrace(traceId);
      if (trace) {
        setSelectedTrace(trace);
        setCurrentStepIdx(0);
        setPlaying(false);
        setError(null);
      }
    } catch {
      setError("Failed to load trace");
    }
  };

  // Autoplay timer
  useEffect(() => {
    if (playing && selectedTrace) {
      timerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= selectedTrace.steps.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1200);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, selectedTrace]);

  const togglePlay = () => {
    if (!selectedTrace) return;
    if (currentStepIdx >= selectedTrace.steps.length - 1) {
      setCurrentStepIdx(0);
    }
    setPlaying(!playing);
  };

  const stepBack = () => {
    setPlaying(false);
    setCurrentStepIdx((p) => Math.max(0, p - 1));
  };

  const stepForward = () => {
    if (!selectedTrace) return;
    setPlaying(false);
    setCurrentStepIdx((p) => Math.min(selectedTrace.steps.length - 1, p + 1));
  };

  if (!open) return null;

  const visibleSteps = selectedTrace
    ? selectedTrace.steps.slice(0, currentStepIdx + 1)
    : [];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[92vw] max-w-5xl h-[82vh] bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <History className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Execution Replay</h3>
          {selectedTrace && (
            <span className="text-[10px] text-zinc-500 ml-2">
              Step {currentStepIdx + 1} / {selectedTrace.steps.length}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Trace List */}
          <div className="w-64 border-r border-zinc-800/50 overflow-y-auto p-2 shrink-0 space-y-1">
            {error && (
              <p className="text-[10px] text-red-400 text-center py-2 px-2">{error}</p>
            )}
            {traces.length === 0 && !error ? (
              <p className="text-xs text-zinc-600 text-center py-8">
                暂无执行记录
              </p>
            ) : (
              traces.map((t) => (
                <TraceListItem
                  key={t.id}
                  trace={t}
                  isSelected={selectedTrace?.id === t.id}
                  onSelect={() => handleSelectTrace(t.id)}
                />
              ))
            )}
          </div>

          {/* Replay Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedTrace ? (
              <>
                {/* Query info */}
                <div className="px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/30">
                  <p className="text-xs text-zinc-400 truncate">
                    <span className="text-zinc-600">Query:</span> {selectedTrace.userMessage}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedTrace.durationMs}ms
                    </span>
                    {selectedTrace.modelId && (
                      <span>Model: {selectedTrace.modelId}</span>
                    )}
                    <span>{selectedTrace.totalSteps} steps</span>
                  </div>
                </div>

                {/* Steps timeline */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {visibleSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`transition-all duration-300 ${
                        idx === currentStepIdx
                          ? "opacity-100 scale-100"
                          : "opacity-60 scale-[0.98]"
                      }`}
                    >
                      <StepBadge step={step} />
                      {step.type === "tool_call" && step.toolResult && (
                        <div className="ml-8 mt-1 px-3 py-1.5 rounded bg-zinc-900/60 border border-zinc-800/30">
                          <pre className="text-[10px] text-zinc-500 font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                            {step.toolResult}
                          </pre>
                        </div>
                      )}
                      {step.type === "text" && step.content && (
                        <div className="ml-8 mt-1 px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800/30">
                          <p className="text-[11px] text-zinc-300 whitespace-pre-wrap">
                            {step.content.substring(0, 300)}
                            {step.content.length > 300 ? "..." : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Playback controls */}
                <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/20">
                  <button
                    onClick={stepBack}
                    disabled={currentStepIdx === 0}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="p-2 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                  >
                    {playing ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={stepForward}
                    disabled={currentStepIdx >= selectedTrace.steps.length - 1}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  {/* Progress bar */}
                  <div className="flex-1 max-w-xs mx-4">
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${selectedTrace.steps.length > 0 ? ((currentStepIdx + 1) / selectedTrace.steps.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                选择一条执行记录开始回放
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
