import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/constants';

interface ProviderStatus {
  name: string;
  healthy: boolean;
  failureRate: number;
  totalCalls: number;
  consecutiveFailures: number;
}

export function useModelStatus(token: string | null, pollMs = 30000) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await axios.get(`${API_URL}/memory/model-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProviders(data.providers || []);
    } catch {
      // Engine offline — no providers
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus, pollMs]);

  return { providers, refresh: fetchStatus };
}