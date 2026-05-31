"use client";

import {
  Terminal, Cpu, Layout, Puzzle, RefreshCw, Store,
} from "lucide-react";
import { TOOL_DESCRIPTIONS } from "../../lib/constants";
import type { ModelInfo, AgentTemplate, PluginInfo, EngineStatus } from "@deepspace/shared-types";

interface ConfigTabProps {
  dna: string;
  onDnaChange: (dna: string) => void;
  availableModels: ModelInfo[];
  selectedModelId?: string;
  onModelChange: (modelId: string) => void;
  templates: AgentTemplate[];
  plugins: PluginInfo[];
  engineStatus: EngineStatus | null;
  onReloadPlugin: (pluginId: string) => void;
}

export function ConfigTab({
  dna, onDnaChange, availableModels, selectedModelId, onModelChange,
  templates, plugins, engineStatus, onReloadPlugin,
}: ConfigTabProps) {
  return (
    <div className="space-y-4">
      {/* Marketplace Link */}
      <a
        href="/marketplace"
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-600/10 border border-purple-500/20 text-sm text-purple-300 hover:bg-purple-600/20 transition-colors"
      >
        <Store className="w-3.5 h-3.5" />
        Agent 市场
        <span className="ml-auto text-[9px] text-purple-500/60">浏览</span>
      </a>

      {/* Model Selector */}
      {availableModels.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            LLM Model
          </label>
          <div className="space-y-1.5">
            {availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => onModelChange(model.id)}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${
                  selectedModelId === model.id
                    ? "bg-purple-500/15 border border-purple-500/30 ring-1 ring-purple-500/20"
                    : "bg-zinc-900/30 border border-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/50"
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  selectedModelId === model.id ? "bg-purple-400 shadow-lg shadow-purple-400/50" : "bg-zinc-600"
                }`} />
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-medium ${selectedModelId === model.id ? "text-purple-300" : "text-zinc-400"}`}>
                    {model.name}
                  </span>
                  <span className="text-[10px] text-zinc-600 leading-tight">
                    {model.provider} · {(model.maxTokens / 1024).toFixed(0)}K tokens
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template Selector */}
      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest flex items-center gap-1.5">
            <Layout className="w-3 h-3" />
            Agent Templates
          </label>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onDnaChange(t.dna)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                  dna === t.dna
                    ? "bg-purple-500/20 border border-purple-500/30 text-purple-300"
                    : "bg-zinc-900/30 border border-zinc-800/30 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
                }`}
                title={t.description}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DNA Editor */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">
          Agent DNA
        </label>
        <textarea
          value={dna}
          onChange={(e) => onDnaChange(e.target.value)}
          className="min-h-[120px] bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 transition-all resize-none leading-relaxed"
          placeholder="定义这个 Agent 的核心本质..."
        />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          随时修改 DNA 来发生突变，改变 Agent 的行为和能力。
        </p>
      </div>

      {/* Mounted Tools */}
      <div className="space-y-2">
        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">
          已挂载工具
        </label>
        <div className="space-y-1.5">
          {(engineStatus?.tools || ["read_file", "write_file", "list_files"]).map(
            (tool: string) => (
              <div
                key={tool}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/30 border border-zinc-800/30"
              >
                <Terminal className="w-3 h-3 text-indigo-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-zinc-400 font-mono">{tool}</span>
                  {TOOL_DESCRIPTIONS[tool] && (
                    <span className="text-[10px] text-zinc-600 leading-tight">{TOOL_DESCRIPTIONS[tool]}</span>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Plugins */}
      <div className="space-y-2">
        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest flex items-center gap-1.5">
          <Puzzle className="w-3 h-3" />
          Plugins
        </label>
        {plugins.length === 0 ? (
          <p className="text-xs text-zinc-600">暂无加载的插件</p>
        ) : (
          <div className="space-y-1.5">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-lg transition-colors ${
                  plugin.enabled
                    ? "bg-zinc-900/30 border border-zinc-800/30"
                    : "bg-zinc-900/20 border border-zinc-800/20 opacity-60"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  plugin.enabled ? "bg-green-400 shadow-sm shadow-green-400/30" : "bg-zinc-600"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-300 font-medium">{plugin.name}</span>
                    <span className="text-[9px] text-zinc-600 font-mono">v{plugin.version}</span>
                  </div>
                  {plugin.description && (
                    <p className="text-[10px] text-zinc-600 mt-0.5 leading-tight line-clamp-2">
                      {plugin.description}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {plugin.toolCount} 个工具{plugin.author ? ` · ${plugin.author}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => onReloadPlugin(plugin.id)}
                  className="text-zinc-600 hover:text-indigo-400 transition-colors p-0.5 shrink-0"
                  title="重新加载插件"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}