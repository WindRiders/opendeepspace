import type { ConversationSummary } from '@deepspace/shared-types';
import { API_URL } from './constants';

export async function fetchConversations(token?: string): Promise<ConversationSummary[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/conversations`, { headers });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function deleteConversation(id: string, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/conversations/${id}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function renameConversation(
  id: string,
  title: string,
  token?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/conversations/${id}/title`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title }),
    });
    return res.ok;
  } catch {
    return false;
  }
}