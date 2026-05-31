/**
 * AgentService — proxies requests to Python Agent Engine via gRPC.
 *
 * The agent loop (LLM calls, tool execution, memory retrieval) runs entirely
 * in the Python engine. This service is a thin gRPC proxy with SSE translation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { SSEEvent, ModelInfo } from '@deepspace/shared-types';
import { GrpcClientService, InteractRequest } from '../grpc/grpc-client.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly grpcClient: GrpcClientService) {}

  getAvailableModels(): ModelInfo[] {
    return [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'DashScope', description: 'Primary reasoning model', maxTokens: 128000, isDefault: true },
      { id: 'qwen-turbo-latest', name: 'Qwen Turbo', provider: 'DashScope', description: 'Fast lightweight model', maxTokens: 131072, isDefault: false },
      { id: 'qwen-plus-latest', name: 'Qwen Plus', provider: 'DashScope', description: 'Balanced performance', maxTokens: 131072, isDefault: false },
      { id: 'qwen-max-latest', name: 'Qwen Max', provider: 'DashScope', description: 'Maximum capability', maxTokens: 32768, isDefault: false },
    ];
  }

  getToolNames(): string[] {
    return ['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run'];
  }

  clearSession(sessionId: string, userId: string): void {
    // Session is managed by Python engine — no-op at gateway level for now
    this.logger.debug(`Session clear requested: ${sessionId}/${userId}`);
  }

  async execute(
    customInstruction: string,
    userMessage: string,
    sessionId: string,
    userId: string,
    modelId?: string,
  ) {
    const request: InteractRequest = {
      dna: customInstruction,
      message: userMessage,
      sessionId,
      userId,
      modelId,
      toolNames: this.getToolNames(),
    };

    try {
      const result = await this.grpcClient.interact(request);
      return {
        reply: result.reply,
        toolCalls: result.toolCalls.map((tc) => ({
          step: tc.step,
          toolName: tc.name,
          args: tc.argsJson ? JSON.parse(tc.argsJson) : {},
          result: tc.result,
        })),
        totalSteps: result.totalSteps,
        sessionId: result.sessionId,
      };
    } catch (error: any) {
      this.logger.error('Agent execution error:', error);
      throw error;
    }
  }

  executeStream(
    customInstruction: string,
    userMessage: string,
    sessionId: string,
    userId: string,
    modelId?: string,
  ): Subject<SSEEvent> {
    const subject = new Subject<SSEEvent>();

    const request: InteractRequest = {
      dna: customInstruction,
      message: userMessage,
      sessionId,
      userId,
      modelId,
      toolNames: this.getToolNames(),
    };

    void (async () => { await Promise.resolve(); await this._runStream(subject, request); })();
    return subject;
  }

  private async _runStream(
    subject: Subject<SSEEvent>,
    request: InteractRequest,
  ) {
    try {
      subject.next({ type: 'session_start', sessionId: request.sessionId });

      for await (const chunk of this.grpcClient.interactStream(request)) {
        switch (chunk.type) {
          case 'thinking':
            subject.next({ type: 'thinking', content: chunk.content || '' });
            break;
          case 'tool_call_start':
            subject.next({
              type: 'tool_call_start',
              step: chunk.step || 0,
              toolName: chunk.toolName || '',
              args: chunk.argsJson ? JSON.parse(chunk.argsJson) : {},
            });
            break;
          case 'tool_call_result':
            subject.next({
              type: 'tool_call_result',
              step: chunk.step || 0,
              toolName: chunk.toolName || '',
              result: chunk.result || '',
              durationMs: chunk.durationMs || 0,
            });
            break;
          case 'text_chunk':
            subject.next({ type: 'text_chunk', content: chunk.content || '' });
            break;
          case 'done':
            subject.next({
              type: 'done',
              totalSteps: chunk.totalSteps || 0,
              sessionId: chunk.sessionId || request.sessionId,
            });
            subject.complete();
            return;
          case 'error':
            subject.next({
              type: 'error',
              code: chunk.code || 'AGENT_ERROR',
              message: chunk.message || 'Unknown error',
            });
            subject.complete();
            return;
        }
      }

      subject.complete();
    } catch (error: any) {
      this.logger.error('Stream execution error:', error);
      subject.next({ type: 'error', code: 'AGENT_ERROR', message: error.message });
      subject.complete();
    }
  }
}