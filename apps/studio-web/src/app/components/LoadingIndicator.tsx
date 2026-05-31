"use client";

import { useState, useEffect } from "react";
import { Cpu, Brain, Wrench, Loader2 } from "lucide-react";

interface LoadingIndicatorProps {
  startTime: number;
  statusText?: string;
}

export function LoadingIndicator({ startTime, statusText }: LoadingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const isThinking = statusText?.includes("推理") || statusText?.includes("Step");
  const isTool = statusText?.includes("调用") || statusText?.includes("完成");

  const displayText = statusText || (
    elapsed < 3 ? "正在思考..." : elapsed < 10 ? "正在推理与执行工具..." : `仍在处理中... ${elapsed}s`
  );

  const StatusIcon = isTool ? Wrench : isThinking ? Brain : Loader2;

  return (
    <div className="flex gap-3 max-w-4xl">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/20 flex items-center justify-center shrink-0">
        <Cpu className="w-4 h-4 text-purple-400 animate-pulse" />
      </div>
      <div className="flex flex-col gap-1 items-start">
        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider px-1">
          Entity
        </span>
        <div className="px-4 py-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/50 rounded-tl-sm">
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-3.5 h-3.5 ${isTool ? "text-indigo-400" : "text-purple-400"} animate-spin`} />
            <span className="text-xs text-zinc-400">
              {displayText}
            </span>
            {elapsed > 0 && (
              <span className="text-[10px] text-zinc-600 tabular-nums">{elapsed}s</span>
            )}
          </div>
          {/* Step progress bar */}
          {isThinking && (
            <div className="mt-2 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
