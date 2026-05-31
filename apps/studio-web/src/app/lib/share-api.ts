import type { ShareLink, ShareType } from "@deepspace/shared-types";
import { API_URL } from './constants';

function getHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ds_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createShare(
  type: ShareType,
  title: string,
  payload: string
): Promise<ShareLink | null> {
  try {
    const res = await fetch(`${API_URL}/shares`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ type, title, payload }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchShare(id: string): Promise<ShareLink | null> {
  try {
    const res = await fetch(`${API_URL}/shares/${id}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMyShares(): Promise<ShareLink[]> {
  try {
    const res = await fetch(`${API_URL}/shares`, {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function deleteShare(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/shares/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}