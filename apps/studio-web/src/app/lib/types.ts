export interface ToolCall {
  step: number;
  toolName: string;
  args: Record<string, any>;
  result: string;
}

export interface ExecutionStepTool {
  toolName: string;
  args: Record<string, any>;
  result?: string;
  durationMs?: number;
  status: "running" | "done";
}

export interface ExecutionStep {
  step: number;
  status: "thinking" | "tool_running" | "complete";
  thinkingText?: string;
  tools: ExecutionStepTool[];
  startTime: number;
  endTime?: number;
}

export interface Message {
  role: "user" | "agent";
  content: string;
  toolCalls?: ToolCall[];
  executionSteps?: ExecutionStep[];
  totalSteps?: number;
  error?: boolean;
  streaming?: boolean;
  timestamp: number;
}
