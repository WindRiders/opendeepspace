import type { ExecutionTrace, TraceSummary } from "@deepspace/shared-types";
import { API_URL } from './constants';

function getHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ds_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchTraces(
  sessionId?: string
): Promise<TraceSummary[]> {
  try {
    const url = new URL(`${API_URL}/traces`);
    if (sessionId) url.searchParams.set("sessionId", sessionId);
    const res = await fetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchTrace(
  traceId: string
): Promise<ExecutionTrace | null> {
  try {
    const res = await fetch(`${API_URL}/traces/${traceId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteTrace(traceId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/traces/${traceId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}