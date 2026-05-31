'use client';

import { useState } from 'react';
import { Search, Brain, Loader2 } from 'lucide-react';
import { useMemory } from '../hooks/useMemory';

interface Props {
  token: string | null;
}

export function MemoryPanel({ token }: Props) {
  const [query, setQuery] = useState('');
  const { memories, loading, recall } = useMemory(token);

  const handleSearch = () => {
    if (query.trim()) recall(query.trim());
  };

  const layerColor = (layer: string) => {
    switch (layer) {
      case 'SHORT_TERM': return 'bg-blue-100 text-blue-700';
      case 'WORKING': return 'bg-yellow-100 text-yellow-700';
      case 'LONG_TERM': return 'bg-green-100 text-green-700';
      case 'META': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-gray-200">
        <Brain className="w-4 h-4 text-purple-500" />
        <span className="font-medium text-sm">Memory Search</span>
      </div>

      <div className="flex gap-1 p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search memories..."
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-purple-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="p-1 text-purple-600 hover:bg-purple-50 rounded"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {memories.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-4">Enter a query to search memories</p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="p-2 border border-gray-100 rounded text-xs">
            <div className="flex items-center gap-1 mb-1">
              <span className={`px-1 py-0.5 rounded text-[10px] ${layerColor(m.layer)}`}>
                {m.layer?.replace('_', ' ') || 'unknown'}
              </span>
              {m.memoryType && (
                <span className="text-gray-400">{m.memoryType}</span>
              )}
              <span className="text-gray-300 ml-auto">
                {m.importance > 0 ? `${(m.importance * 100).toFixed(0)}%` : ''}
              </span>
            </div>
            <p className="text-gray-700 line-clamp-3">
              {m.summary || m.content?.substring(0, 200)}
            </p>
            {m.tags?.length > 0 && (
              <div className="flex gap-1 mt-1">
                {m.tags.map((t, i) => (
                  <span key={i} className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}