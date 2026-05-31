"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen, FileText, ChevronRight, ChevronDown,
  RefreshCw, X, Code,
} from "lucide-react";
import {
  fetchSandboxFiles,
  readSandboxFile,
  type SandboxFileEntry,
  type SandboxFileContent,
} from "../lib/sandbox-api";

function FileTreeNode({
  entry,
  depth,
  onSelect,
  selectedPath,
}: {
  entry: SandboxFileEntry;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath?: string;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = entry.type === "directory";
  const isSelected = entry.path === selectedPath;

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onSelect(entry.path);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11px] rounded transition-colors ${
          isSelected
            ? "bg-purple-500/15 text-purple-300"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          <FolderOpen className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <span className="truncate font-mono">{entry.name}</span>
        {!isDir && entry.size !== undefined && (
          <span className="ml-auto text-[9px] text-zinc-600 shrink-0">
            {entry.size > 1024 ? `${(entry.size / 1024).toFixed(1)}KB` : `${entry.size}B`}
          </span>
        )}
      </button>
      {isDir && expanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SandboxExplorer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<SandboxFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<SandboxFileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const entries = await fetchSandboxFiles();
      setFiles(entries);
      setError(null);
    } catch {
      setError("Failed to load files");
    }
  }, []);

  useEffect(() => {
    if (open) loadFiles();
  }, [open, loadFiles]);

  const handleSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    setLoading(true);
    setError(null);
    try {
      const content = await readSandboxFile(filePath);
      setFileContent(content);
    } catch {
      setError("Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[90vw] max-w-5xl h-[80vh] bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <Code className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Sandbox Explorer</h3>
          <button
            onClick={loadFiles}
            className="ml-2 p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {error && (
            <span className="ml-2 text-[10px] text-red-400">{error}</span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* File Tree */}
          <div className="w-64 border-r border-zinc-800/50 overflow-y-auto p-2 shrink-0">
            {files.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-8">
                沙盒为空
              </p>
            ) : (
              files.map((entry) => (
                <FileTreeNode
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  onSelect={handleSelect}
                  selectedPath={selectedFile}
                />
              ))
            )}
          </div>

          {/* File Content */}
          <div className="flex-1 overflow-auto min-w-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Loading...
              </div>
            ) : fileContent ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/30">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-400 font-mono">{selectedFile}</span>
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {fileContent.language} · {(fileContent.size / 1024).toFixed(1)}KB
                  </span>
                </div>
                <pre className="flex-1 overflow-auto p-4 text-[12px] leading-relaxed text-zinc-300 font-mono whitespace-pre-wrap break-words">
                  {fileContent.content}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                选择一个文件查看内容
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
