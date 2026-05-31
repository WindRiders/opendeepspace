import { API_URL } from "./constants";

export interface SandboxFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: number;
  children?: SandboxFileEntry[];
}

export interface SandboxFileContent {
  content: string;
  size: number;
  language: string;
}

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ds_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchSandboxFiles(dirPath?: string): Promise<SandboxFileEntry[]> {
  try {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
    const res = await fetch(`${API_URL}/sandbox/files${params}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function readSandboxFile(filePath: string): Promise<SandboxFileContent | null> {
  try {
    const res = await fetch(`${API_URL}/sandbox/read?path=${encodeURIComponent(filePath)}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
