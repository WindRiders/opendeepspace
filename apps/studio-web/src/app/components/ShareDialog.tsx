"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Share2, X, Copy, Check, Link, Trash2, Eye, Dna, FileText, Layout,
} from "lucide-react";
import { createShare, fetchMyShares, deleteShare } from "../lib/share-api";
import type { ShareLink, ShareType } from "@deepspace/shared-types";

const TYPE_CONFIG: Record<
  ShareType,
  { label: string; icon: typeof Dna; color: string }
> = {
  dna: { label: "DNA", icon: Dna, color: "text-purple-400" },
  trace: { label: "Trace", icon: FileText, color: "text-blue-400" },
  template: { label: "Template", icon: Layout, color: "text-emerald-400" },
};

function ShareItem({
  share,
  onDelete,
}: {
  share: ShareLink;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const config = TYPE_CONFIG[share.type] || TYPE_CONFIG.dna;
  const Icon = config.icon;
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}?share=${share.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available (e.g. non-HTTPS)
    }
  };

  const date = new Date(share.createdAt * 1000);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-900/30 border border-zinc-800/40">
      <Icon className={`w-4 h-4 shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-300 truncate">{share.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-zinc-600">
          <span>{config.label}</span>
          <span className="flex items-center gap-0.5">
            <Eye className="w-2.5 h-2.5" /> {share.viewCount}
          </span>
          <span>
            {date.toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
      <button
        onClick={copyLink}
        className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
        title="Copy link"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        onClick={() => onDelete(share.id)}
        className="p-1.5 rounded text-zinc-600 hover:text-rose-400 hover:bg-zinc-800/50 transition-colors"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ShareDialog({
  open,
  onClose,
  dna,
}: {
  open: boolean;
  onClose: () => void;
  dna?: string;
}) {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [title, setTitle] = useState("");
  const [shareType, setShareType] = useState<ShareType>("dna");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    try {
      const list = await fetchMyShares();
      setShares(list);
    } catch {
      // Ignore load errors
    }
  }, []);

  useEffect(() => {
    if (open) loadShares();
  }, [open, loadShares]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      let payload = "";
      if (shareType === "dna") payload = dna || "";

      const share = await createShare(shareType, title, payload);
      if (share) {
        setShares((prev) => [share, ...prev]);
        setTitle("");
      }
    } catch {
      setCreateError("Failed to create share. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    try {
      const ok = await deleteShare(id);
      if (ok) setShares((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setDeleteError("Failed to delete share.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[90vw] max-w-lg bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <Share2 className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Share</h3>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create share */}
        <div className="px-4 py-3 border-b border-zinc-800/40 space-y-3">
          <div className="flex gap-2">
            {(Object.entries(TYPE_CONFIG) as [ShareType, typeof TYPE_CONFIG.dna][]).map(
              ([type, config]) => (
                <button
                  key={type}
                  onClick={() => setShareType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
                    shareType === type
                      ? `${config.color} bg-zinc-800/50 border-current`
                      : "text-zinc-600 border-zinc-800/30 hover:border-zinc-700"
                  }`}
                >
                  <config.icon className="w-3 h-3" />
                  {config.label}
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Share title..."
              className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-purple-500/40"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={!title.trim() || creating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Link className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
          {createError && (
            <p className="text-[10px] text-red-400">{createError}</p>
          )}
        </div>

        {/* Share list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {deleteError && (
            <p className="text-[10px] text-red-400 mb-2">{deleteError}</p>
          )}
          {shares.length === 0 && !deleteError ? (
            <p className="text-xs text-zinc-600 text-center py-8">
              No shares yet
            </p>
          ) : (
            shares.map((s) => (
              <ShareItem key={s.id} share={s} onDelete={handleDelete} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
