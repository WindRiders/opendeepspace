export interface ToolCall {
  step: number;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  maxTokens: number;
  isDefault?: boolean;
}

export interface EngineStatus {
  status: string;
  core: string;
  tools: string[];
  models: ModelInfo[];
  phase: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  dna: string;
  icon: string;
  category: 'coding' | 'writing' | 'analysis' | 'creative' | 'utility';
  tags: string[];
  isBuiltIn: boolean;
}

export interface TraceStep {
  step: number;
  type: 'thinking' | 'tool_call' | 'text';
  timestamp: number;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  durationMs?: number;
}

export interface ExecutionTrace {
  id: string;
  sessionId: string;
  userMessage: string;
  agentReply: string;
  steps: TraceStep[];
  totalSteps: number;
  modelId?: string;
  dna?: string;
  createdAt: number;
  durationMs: number;
}

export interface TraceSummary {
  id: string;
  sessionId: string;
  userMessage: string;
  totalSteps: number;
  toolCount: number;
  createdAt: number;
  durationMs: number;
}

export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'researcher';

export interface AgentRoleConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
}

export interface CollabMessage {
  id: string;
  from: AgentRole | 'user' | 'orchestrator';
  to: AgentRole | 'all';
  content: string;
  timestamp: number;
  type: 'task' | 'response' | 'handoff' | 'summary';
}

export interface CollabSession {
  id: string;
  task: string;
  agents: AgentRole[];
  messages: CollabMessage[];
  status: 'planning' | 'executing' | 'reviewing' | 'complete' | 'error';
  createdAt: number;
}
