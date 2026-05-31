export type SSEEventType =
  | 'session_start'
  | 'thinking'
  | 'text_chunk'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'done'
  | 'error';

export interface SSESessionStart {
  type: 'session_start';
  sessionId: string;
}

export interface SSEThinking {
  type: 'thinking';
  content: string;
}

export interface SSETextChunk {
  type: 'text_chunk';
  content: string;
}

export interface SSEToolCallStart {
  type: 'tool_call_start';
  step: number;
  toolName: string;
  args: Record<string, unknown>;
}

export interface SSEToolCallResult {
  type: 'tool_call_result';
  step: number;
  toolName: string;
  result: string;
  durationMs: number;
}

export interface SSEDone {
  type: 'done';
  totalSteps: number;
  sessionId: string;
}

export interface SSEError {
  type: 'error';
  code: string;
  message: string;
}

export type SSEEvent =
  | SSESessionStart
  | SSEThinking
  | SSETextChunk
  | SSEToolCallStart
  | SSEToolCallResult
  | SSEDone
  | SSEError;

// Collab SSE events
export type CollabSSEEventType =
  | 'collab_agent_start'
  | 'collab_agent_chunk'
  | 'collab_agent_done'
  | 'collab_done'
  | 'collab_error';

export interface CollabAgentStart {
  type: 'collab_agent_start';
  sessionId: string;
  agentRole: string;
  agentName: string;
}

export interface CollabAgentChunk {
  type: 'collab_agent_chunk';
  sessionId: string;
  agentRole: string;
  content: string;
}

export interface CollabAgentDone {
  type: 'collab_agent_done';
  sessionId: string;
  agentRole: string;
  fullContent: string;
}

export interface CollabDone {
  type: 'collab_done';
  sessionId: string;
  summary: string;
}

export interface CollabError {
  type: 'collab_error';
  sessionId: string;
  message: string;
}

export type CollabSSEEvent =
  | CollabAgentStart
  | CollabAgentChunk
  | CollabAgentDone
  | CollabDone
  | CollabError;
