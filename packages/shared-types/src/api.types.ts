import { ToolCall } from './agent.types';

export interface InteractRequest {
  message: string;
  dna?: string;
  sessionId?: string;
  modelId?: string;
}

export interface InteractResponse {
  agentDna: string;
  reply: string;
  toolCalls: ToolCall[];
  totalSteps: number;
  sessionId: string;
}

export interface AgentStatusResponse {
  status: string;
  core: string;
  tools: string[];
  phase: number;
}

export interface SessionClearedResponse {
  message: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Array<{
    role: 'user' | 'agent' | 'system';
    content: string;
  }>;
}

export type ShareType = 'dna' | 'trace' | 'template';

export interface ShareLink {
  id: string;
  type: ShareType;
  title: string;
  payload: string;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  viewCount: number;
}

export interface CreateShareRequest {
  type: ShareType;
  title: string;
  payload: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  toolCount: number;
  loadedAt?: number;
}

export interface ReloadPluginResponse {
  success: boolean;
  pluginId: string;
  toolCount: number;
  error?: string;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  dna: string;
  author: string;
  tags: string[];
  stars: number;
  downloads: number;
  modelId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublishAgentRequest {
  name: string;
  description: string;
  dna: string;
  tags?: string[];
  modelId?: string;
}
