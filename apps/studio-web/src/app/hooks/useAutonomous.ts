import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/constants';

interface LearningTask {
  id: string;
  topic: string;
  priority: number;
  status: string;
}

interface AutonomousData {
  isIdle: boolean;
  pendingTasks: LearningTask[];
  activeTask: LearningTask | null;
  dailyCost: number;
  dailyBudget: number;
}

export function useAutonomous(token: string | null, pollMs = 15000) {
  const [data, setData] = useState<AutonomousData>({
    isIdle: true, pendingTasks: [], activeTask: null, dailyCost: 0, dailyBudget: 1,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const { data: resp } = await axios.get(`${API_URL}/memory/autonomous-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData({
        isIdle: resp.isIdle ?? true,
        pendingTasks: resp.pendingTasks || [],
        activeTask: resp.activeTask || null,
        dailyCost: resp.dailyCost || 0,
        dailyBudget: resp.dailyBudget || 1,
      });
    } catch {
      // Engine offline — keep defaults
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus, pollMs]);

  return { ...data, refresh: fetchStatus };
}