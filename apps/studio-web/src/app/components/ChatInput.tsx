"use client";

import { useRef, useCallback } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
}

export function ChatInput({ input, onInputChange, onSend, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-3 lg:p-4 pt-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-end gap-2 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-purple-500/30 focus-within:border-purple-500/20 transition-all max-w-4xl mx-auto"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="与实体对话...     ⏎ 发送 · Shift+⏎ 换行"
          rows={1}
          className="flex-1 bg-transparent border-none text-sm px-3 py-2 focus:outline-none text-zinc-200 placeholder-zinc-600 resize-none leading-relaxed max-h-[140px]"
          style={{ height: "auto" }}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white flex items-center justify-center hover:from-purple-400 hover:to-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none shrink-0 mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <p className="text-center mt-2 text-[9px] text-zinc-700 font-medium tracking-[0.2em] uppercase">
        DeepSpace Network • Phase 2 Evolution
      </p>
    </div>
  );
}
