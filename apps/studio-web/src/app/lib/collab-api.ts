import type {
  AgentRoleConfig,
  CollabSession,
  CollabMessage,
} from "@deepspace/shared-types";
import { API_URL } from './constants';

function getHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ds_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchRoles(): Promise<AgentRoleConfig[]> {
  try {
    const res = await fetch(`${API_URL}/collab/roles`, {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchCollabSessions(): Promise<CollabSession[]> {
  try {
    const res = await fetch(`${API_URL}/collab/sessions`, {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchCollabSession(
  id: string
): Promise<CollabSession | null> {
  try {
    const res = await fetch(`${API_URL}/collab/sessions/${id}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function createCollabSession(
  task: string,
  agents: string[]
): Promise<CollabSession | null> {
  try {
    const res = await fetch(`${API_URL}/collab/sessions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ task, agents }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function addCollabMessage(
  sessionId: string,
  from: string,
  to: string,
  content: string,
  type: CollabMessage["type"]
): Promise<CollabMessage | null> {
  try {
    const res = await fetch(`${API_URL}/collab/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ from, to, content, type }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}