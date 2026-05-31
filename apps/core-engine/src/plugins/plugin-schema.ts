export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled?: boolean;
  tools: string[];
}

export interface PluginInfo {
  manifest: PluginManifest;
  dirPath: string;
  enabled: boolean;
  toolCount: number;
  loadedAt?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  sandboxRoot: string;
  apiKeys?: Record<string, string>;
}
