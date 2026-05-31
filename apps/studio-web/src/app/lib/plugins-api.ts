import type { PluginInfo, ReloadPluginResponse } from '@deepspace/shared-types';
import { API_URL } from './constants';

export async function fetchPlugins(token?: string): Promise<PluginInfo[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_URL}/plugins`, { headers });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function reloadPlugin(
  pluginId: string,
  token?: string,
): Promise<ReloadPluginResponse | null> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_URL}/plugins/${pluginId}/reload`, {
      method: 'POST',
      headers,
    });
    return res.json();
  } catch {
    return null;
  }
}

export async function togglePlugin(
  pluginId: string,
  enabled: boolean,
  token?: string,
): Promise<{ success: boolean; pluginId: string; enabled: boolean; toolCount: number } | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_URL}/plugins/${pluginId}/toggle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enabled }),
    });
    return res.json();
  } catch {
    return null;
  }
}

export async function installPlugin(
  dirPath: string,
  token?: string,
): Promise<{ success: boolean; id: string; name: string; toolCount: number } | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_URL}/plugins/install`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dirPath }),
    });
    return res.json();
  } catch {
    return null;
  }
}