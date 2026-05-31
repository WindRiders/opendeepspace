import type { MarketplaceAgent, PublishAgentRequest } from '@deepspace/shared-types';
import { API_URL } from './constants';

function getHeaders(): HeadersInit {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('ds_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchMarketplaceAgents(
  search?: string,
  tag?: string,
  limit?: number,
  offset?: number,
): Promise<MarketplaceAgent[]> {
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const url = `${API_URL}/marketplace${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchMarketplaceAgent(
  id: string,
): Promise<MarketplaceAgent | null> {
  try {
    const res = await fetch(`${API_URL}/marketplace/${id}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function publishAgent(
  data: PublishAgentRequest,
): Promise<MarketplaceAgent | null> {
  try {
    const res = await fetch(`${API_URL}/marketplace`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function starAgent(
  id: string,
): Promise<MarketplaceAgent | null> {
  try {
    const res = await fetch(`${API_URL}/marketplace/${id}/star`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function downloadMarketplaceAgent(
  id: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/marketplace/${id}/download`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.downloads;
  } catch {
    return null;
  }
}

export async function deleteMarketplaceAgent(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/marketplace/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}