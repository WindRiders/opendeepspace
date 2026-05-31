import { API_URL } from "./constants";
import type { AgentTemplate } from "@deepspace/shared-types";

export async function fetchTemplates(): Promise<AgentTemplate[]> {
  try {
    const res = await fetch(`${API_URL}/templates`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
