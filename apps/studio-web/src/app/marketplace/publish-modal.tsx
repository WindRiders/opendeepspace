"use client";

import { Plus, X } from "lucide-react";

interface PublishModalProps {
  name: string;
  description: string;
  dna: string;
  tags: string[];
  tagInput: string;
  error: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onDnaChange: (v: string) => void;
  onTagInputChange: (v: string) => void;
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  onTagKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPublish: () => void;
  onClose: () => void;
}

export function PublishModal({
  name,
  description,
  dna,
  tags,
  tagInput,
  error,
  onNameChange,
  onDescriptionChange,
  onDnaChange,
  onTagInputChange,
  onTagAdd,
  onTagRemove,
  onTagKeyDown,
  onPublish,
  onClose,
}: PublishModalProps) {
  const canSubmit = name.trim() && description.trim() && dna.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-lg bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/50">
          <Plus className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-200">发布 Agent</h3>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="你的 Agent 名称"
              className="w-full px-3 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-purple-500/40"
              maxLength={64}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">描述</label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="描述你的 Agent 能做什么..."
              className="w-full h-20 px-3 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-purple-500/40 resize-none"
              maxLength={512}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Agent DNA (System Prompt)</label>
            <textarea
              value={dna}
              onChange={(e) => onDnaChange(e.target.value)}
              placeholder="定义 Agent 的核心本质..."
              className="w-full h-32 px-3 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-purple-500/40 resize-none font-mono"
              maxLength={4096}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">标签</label>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg min-h-[40px] focus-within:border-purple-500/40">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-purple-500/15 text-purple-300 border border-purple-500/20"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => onTagRemove(tag)}
                    className="text-purple-400/60 hover:text-purple-300"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => onTagInputChange(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => tagInput && onTagAdd(tagInput)}
                placeholder={tags.length === 0 ? "输入标签后按回车..." : ""}
                className="flex-1 min-w-[80px] bg-transparent text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none"
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={onPublish}
            disabled={!canSubmit}
            className="w-full px-4 py-2.5 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            发布到市场
          </button>
        </div>
      </div>
    </div>
  );
}