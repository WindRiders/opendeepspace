"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Zap, X, Plus, } from "lucide-react";
import { fetchConversations, deleteConversation } from "../lib/conversations-api";
import { fetchTemplates } from "../lib/templates-api";
import { fetchPlugins, reloadPlugin } from "../lib/plugins-api";
import type { ConversationSummary, ModelInfo, AgentTemplate, PluginInfo, EngineStatus } from "@deepspace/shared-types";
import { HistoryTab } from "./sidebar/HistoryTab";
import { ConfigTab } from "./sidebar/ConfigTab";

interface SidebarProps {
  dna: string;
  onDnaChange: (dna: string) => void;
  engineStatus: EngineStatus | null;
  open: boolean;
  onClose: () => void;
  currentSessionId: string;
  onNewChat: () => void;
  availableModels: ModelInfo[];
  selectedModelId?: string;
  onModelChange: (modelId: string) => void;
}

export function Sidebar({
  dna, onDnaChange, engineStatus, open, onClose,
  currentSessionId, onNewChat, availableModels, selectedModelId, onModelChange,
}: SidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "config">("history");

  const loadConversations = useCallback(async () => {
    const list = await fetchConversations();
    setConversations(list);
  }, []);

  const loadPlugins = useCallback(async () => {
    const list = await fetchPlugins();
    setPlugins(list);
  }, []);

  useEffect(() => {
    loadConversations();
    fetchTemplates().then(setTemplates);
    loadPlugins();
  }, [loadConversations, loadPlugins]);

  const handleReloadPlugin = async (pluginId: string) => {
    await reloadPlugin(pluginId);
    await loadPlugins();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />
      )}
      <div
        className={`
          fixed lg:relative z-30 h-full w-80
          border-r border-zinc-800/70 bg-gradient-to-b from-[#0d0d14] to-[#08080c]
          p-6 flex flex-col gap-4 shrink-0
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:hidden"}
        `}
      >
        <button onClick={onClose} className="absolute top-4 right-4 lg:hidden text-zinc-500 hover:text-zinc-300">
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-purple-300 to-indigo-300 bg-clip-text text-transparent">
              DeepSpace
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-widest uppercase">Creator Studio</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
          <div
            className={`w-2 h-2 rounded-full ${
              engineStatus ? "bg-green-400 shadow-lg shadow-green-400/50 animate-pulse" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-zinc-400">
            {engineStatus ? "Core Engine 在线" : "Core Engine 离线"}
          </span>
          {engineStatus && <Zap className="w-3 h-3 text-amber-400 ml-auto" />}
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-sm text-purple-300 hover:bg-purple-600/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建对话
        </button>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800/50">
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 text-xs py-2 font-medium transition-colors ${
              activeTab === "history" ? "text-purple-300 border-b-2 border-purple-500" : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            对话历史
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`flex-1 text-xs py-2 font-medium transition-colors ${
              activeTab === "config" ? "text-purple-300 border-b-2 border-purple-500" : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            配置
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "history" ? (
            <HistoryTab conversations={conversations} currentSessionId={currentSessionId} onDelete={handleDelete} />
          ) : (
            <ConfigTab
              dna={dna}
              onDnaChange={onDnaChange}
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              onModelChange={onModelChange}
              templates={templates}
              plugins={plugins}
              engineStatus={engineStatus}
              onReloadPlugin={handleReloadPlugin}
            />
          )}
        </div>
      </div>
    </>
  );
}