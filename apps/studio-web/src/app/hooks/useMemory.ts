import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/constants';

interface MemoryItem {
  id: string;
  content: string;
  summary: string;
  layer: string;
  memoryType: string;
  importance: number;
  project: string;
  tags: string[];
  source: string;
}

export function useMemory(token: string | null) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const recall = useCallback(async (query: string, topK = 10) => {
    if (!token) return;
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/memory/recall`, { query, topK }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMemories(data.memories || []);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { memories, loading, recall };
}