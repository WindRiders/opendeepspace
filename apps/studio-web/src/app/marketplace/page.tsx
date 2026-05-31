"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Star,
  Plus,
  Sparkles,
  ArrowLeft,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  fetchMarketplaceAgents,
  publishAgent,
  starAgent,
  downloadMarketplaceAgent,
} from "../lib/marketplace-api";
import type { MarketplaceAgent } from "@deepspace/shared-types";
import { AgentCard } from "./agent-card";
import { AgentDetailModal } from "./agent-detail-modal";
import { PublishModal } from "./publish-modal";

export default function MarketplacePage() {
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");
  const PAGE_SIZE = 12;

  // Publish form state
  const [publishName, setPublishName] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishDna, setPublishDna] = useState("");
  const [publishTags, setPublishTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const list = await fetchMarketplaceAgents(
      search || undefined,
      selectedTag || undefined,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    );
    setAgents(list);
    setLoading(false);
  }, [search, selectedTag, page]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = await starAgent(id);
    if (updated) {
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (selectedAgent?.id === id) setSelectedAgent(updated);
    }
  };

  const handleDownload = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await downloadMarketplaceAgent(id);
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, downloads: a.downloads + 1 } : a)),
    );
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag === selectedTag ? "" : tag);
    setPage(1);
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !publishTags.includes(t) && publishTags.length < 8) {
      setPublishTags([...publishTags, t]);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && publishTags.length > 0) {
      setPublishTags(publishTags.slice(0, -1));
    }
  };

  const handlePublish = async () => {
    if (!publishName.trim() || !publishDesc.trim() || !publishDna.trim()) return;
    setError("");
    const agent = await publishAgent({
      name: publishName,
      description: publishDesc,
      dna: publishDna,
      tags: publishTags.length > 0 ? publishTags : undefined,
    });
    if (agent) {
      setShowPublish(false);
      setPublishName("");
      setPublishDesc("");
      setPublishDna("");
      setPublishTags([]);
      setTagInput("");
      loadAgents();
    } else {
      setError("发布失败，请检查网络连接或登录状态");
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const allTags = Array.from(new Set(agents.flatMap((a) => a.tags))).slice(0, 20);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d0d14] to-[#08080c] text-zinc-300">
      {/* Header */}
      <div className="border-b border-zinc-800/70 bg-[#0d0d14]/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <a href="/" className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-zinc-200">Agent 市场</h1>
          </div>
          <button
            onClick={() => setShowPublish(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-sm text-purple-300 hover:bg-purple-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            发布 Agent
          </button>
        </div>

        {/* Search & Filter */}
        <div className="max-w-6xl mx-auto px-4 pb-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索 Agent..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => handleTagSelect("")}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                !selectedTag
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  : "bg-zinc-900/30 text-zinc-500 border border-zinc-800/30 hover:text-zinc-400"
              }`}
            >
              全部
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagSelect(tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors border ${
                  tag === selectedTag
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    : "bg-zinc-900/30 text-zinc-500 border border-zinc-800/30 hover:text-zinc-400"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-600 text-sm">暂无 Agent</p>
            <p className="text-zinc-700 text-xs mt-1">成为第一个发布者！</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onSelect={setSelectedAgent}
                  onStar={handleStar}
                  onDownload={handleDownload}
                />
              ))}
            </div>
            {agents.length === PAGE_SIZE && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900/40 border border-zinc-800/50 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onStar={handleStar}
          onToast={showToast}
        />
      )}

      {/* Publish Modal */}
      {showPublish && (
        <PublishModal
          name={publishName}
          description={publishDesc}
          dna={publishDna}
          tags={publishTags}
          tagInput={tagInput}
          error={error}
          onNameChange={setPublishName}
          onDescriptionChange={setPublishDesc}
          onDnaChange={setPublishDna}
          onTagInputChange={setTagInput}
          onTagAdd={addTag}
          onTagRemove={(tag) => setPublishTags(publishTags.filter((t) => t !== tag))}
          onTagKeyDown={handleTagKeyDown}
          onPublish={handlePublish}
          onClose={() => setShowPublish(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-500/15 text-green-400 border border-green-500/25 text-sm transition-all duration-300">
          {toast}
        </div>
      )}
    </div>
  );
}