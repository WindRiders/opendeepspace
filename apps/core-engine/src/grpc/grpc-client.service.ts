/**
 * DeepSpace gRPC Client — TypeScript wrapper for AgentEngine service.
 *
 * Uses @grpc/grpc-js with proto-loader for dynamic loading (no codegen step needed).
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

// Proto path is resolved at runtime
const PROTO_PATH = path.resolve(
  __dirname,
  fs.existsSync(path.join(__dirname, 'agent.proto'))
    ? 'agent.proto'
    : '../../../../proto/agent.proto',
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcObject = grpc.loadPackageDefinition(packageDefinition) as any;
const AgentEngineClient = grpcObject.deepspace?.AgentEngine;

// ─── Type Definitions (mirrors proto messages) ────────────────────────

export interface InteractRequest {
  dna: string;
  message: string;
  sessionId: string;
  userId: string;
  modelId?: string;
  toolNames: string[];
}

export interface InteractResponse {
  reply: string;
  toolCalls: ToolCall[];
  totalSteps: number;
  sessionId: string;
}

export interface ToolCall {
  name: string;
  argsJson: string;
  result: string;
  step: number;
}

export interface InteractStreamChunk {
  type: string;
  content?: string;
  toolName?: string;
  argsJson?: string;
  result?: string;
  step?: number;
  totalSteps?: number;
  sessionId?: string;
  durationMs?: number;
  code?: string;
  message?: string;
}

export interface RecallRequest {
  query: string;
  layer?: string;
  memoryType?: string;
  project?: string;
  tags?: string[];
  topK?: number;
  minImportance?: number;
}

export interface Memory {
  id: string;
  content: string;
  summary: string;
  layer: string;
  memoryType: string;
  importance: number;
  project: string;
  tags: string[];
  source: string;
}

export interface RecallResponse {
  memories: Memory[];
}

export interface SolveRequest {
  goal: string;
  context?: string;
  mode?: string;
  userId: string;
}

export interface SolveResponse {
  goalId: string;
  outcome: string;
  stepsTotal: number;
  stepsPassed: number;
  plan: ActionStep[];
  summary: string;
}

export interface ActionStep {
  index: number;
  description: string;
  command: string;
  actionType: string;
}

export interface AutonomousStatusResponse {
  isIdle: boolean;
  pendingTasks: LearningTask[];
  activeTask: LearningTask | null;
  dailyCost: number;
  dailyBudget: number;
}

export interface LearningTask {
  id: string;
  topic: string;
  priority: number;
  status: string;
}

export interface ProactiveContextResponse {
  focus: string;
  topics: string[];
  activityPattern: string;
  predictions: Prediction[];
}

export interface Prediction {
  topic: string;
  priority: number;
  relevance: number;
}

export interface ModelStatusResponse {
  providers: ProviderStatus[];
}

export interface ProviderStatus {
  name: string;
  healthy: boolean;
  failureRate: number;
  totalCalls: number;
  consecutiveFailures: number;
}

export interface GraphSearchResult {
  entities: { id: string; name: string; type: string; description: string; confidence: number }[];
}

@Injectable()
export class GrpcClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrpcClientService.name);
  private client: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const engineUrl = this.configService.get<string>('GRPC_ENGINE_URL', 'localhost:50051');

    if (!AgentEngineClient) {
      this.logger.warn('gRPC AgentEngine not found in proto — running in mock mode');
      return;
    }

    this.client = new AgentEngineClient(
      engineUrl,
      grpc.credentials.createInsecure(),
      {
        'grpc.max_receive_message_length': 10 * 1024 * 1024, // 10MB
        'grpc.max_send_message_length': 10 * 1024 * 1024,
      },
    );

    this.logger.log(`gRPC client connected to ${engineUrl}`);
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.close();
    }
  }

  private promisify(method: string, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('gRPC client not initialized'));
        return;
      }
      this.client[method](request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  // ─── Agent ──────────────────────────────────────────────────

  async interact(request: InteractRequest): Promise<InteractResponse> {
    const resp = await this.promisify('interact', {
      dna: request.dna,
      message: request.message,
      session_id: request.sessionId,
      user_id: request.userId,
      model_id: request.modelId || '',
      tool_names: request.toolNames || [],
    });
    return {
      reply: resp.reply,
      toolCalls: (resp.tool_calls || []).map((tc: any) => ({
        name: tc.name,
        argsJson: tc.args_json,
        result: tc.result,
        step: tc.step,
      })),
      totalSteps: resp.total_steps,
      sessionId: resp.session_id,
    };
  }

  interactStream(request: InteractRequest): AsyncGenerator<InteractStreamChunk> {
    const call = this.client.interactStream({
      dna: request.dna,
      message: request.message,
      session_id: request.sessionId,
      user_id: request.userId,
      model_id: request.modelId || '',
      tool_names: request.toolNames || [],
    });

    return (async function* () {
      const pending: InteractStreamChunk[] = [];
      let done = false;
      let error: Error | null = null;

      call.on('data', (chunk: any) => {
        pending.push({
          type: chunk.type,
          content: chunk.content,
          toolName: chunk.tool_name,
          argsJson: chunk.args_json,
          result: chunk.result,
          step: chunk.step,
          totalSteps: chunk.total_steps,
          sessionId: chunk.session_id,
          durationMs: chunk.duration_ms,
          code: chunk.code,
          message: chunk.message,
        });
      });

      call.on('end', () => { done = true; });
      call.on('error', (err: Error) => { done = true; error = err; });

      while (!done || pending.length > 0) {
        if (pending.length > 0) {
          yield pending.shift()!;
        } else if (!done) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (pending.length > 0 || done) resolve();
              else setTimeout(check, 10);
            };
            check();
          });
        }
      }

      if (error) throw error;
    })();
  }

  // ─── Memory ─────────────────────────────────────────────────

  async remember(content: string, layer?: string, memoryType?: string, project?: string, tags?: string[]): Promise<string> {
    const resp = await this.promisify('remember', {
      content, layer: layer || '', memory_type: memoryType || '',
      project: project || '', tags: tags || [],
    });
    return resp.memory_id;
  }

  async recall(request: RecallRequest): Promise<RecallResponse> {
    const resp: any = await this.promisify('recall', {
      query: request.query,
      layer: request.layer || '',
      memory_type: request.memoryType || '',
      project: request.project || '',
      tags: request.tags || [],
      top_k: request.topK || 10,
      min_importance: request.minImportance || 0,
    });
    return {
      memories: (resp.memories || []).map((m: any) => ({
        id: m.id, content: m.content, summary: m.summary,
        layer: m.layer, memoryType: m.memory_type,
        importance: m.importance, project: m.project,
        tags: m.tags || [], source: m.source,
      })),
    };
  }

  async consolidate(): Promise<{ promotedCount: number; cleanedCount: number }> {
    const resp: any = await this.promisify('consolidate', {});
    return { promotedCount: resp.promoted_count, cleanedCount: resp.cleaned_count };
  }

  // ─── Orchestration ──────────────────────────────────────────

  async solve(request: SolveRequest): Promise<SolveResponse> {
    const resp: any = await this.promisify('solve', {
      goal: request.goal, context: request.context || '',
      mode: request.mode || 'semi_auto', user_id: request.userId,
    });
    return {
      goalId: resp.goal_id, outcome: resp.outcome,
      stepsTotal: resp.steps_total, stepsPassed: resp.steps_passed,
      plan: (resp.plan || []).map((s: any) => ({
        index: s.index, description: s.description,
        command: s.command, actionType: s.action_type,
      })),
      summary: resp.summary,
    };
  }

  solveStream(request: SolveRequest): AsyncGenerator<any> {
    const call = this.client.solveStream({
      goal: request.goal, context: request.context || '',
      mode: request.mode || 'semi_auto', user_id: request.userId,
    });

    return (async function* () {
      const pending: any[] = [];
      let done = false;
      call.on('data', (chunk: any) => pending.push(chunk));
      call.on('end', () => { done = true; });
      call.on('error', () => { done = true; });

      while (!done || pending.length > 0) {
        if (pending.length > 0) yield pending.shift()!;
        else if (!done) await new Promise(r => setTimeout(r, 10));
      }
    })();
  }

  // ─── Autonomous ─────────────────────────────────────────────

  async getAutonomousStatus(): Promise<AutonomousStatusResponse> {
    const resp: any = await this.promisify('getAutonomousStatus', {});
    return {
      isIdle: resp.is_idle,
      pendingTasks: (resp.pending_tasks || []).map((t: any) => ({
        id: t.id, topic: t.topic, priority: t.priority, status: t.status,
      })),
      activeTask: resp.active_task ? {
        id: resp.active_task.id, topic: resp.active_task.topic,
        priority: resp.active_task.priority, status: resp.active_task.status,
      } : null,
      dailyCost: resp.daily_cost, dailyBudget: resp.daily_budget,
    };
  }

  async getProactiveContext(): Promise<ProactiveContextResponse> {
    const resp: any = await this.promisify('getProactiveContext', {});
    return {
      focus: resp.focus, topics: resp.topics || [],
      activityPattern: resp.activity_pattern,
      predictions: (resp.predictions || []).map((p: any) => ({
        topic: p.topic, priority: p.priority, relevance: p.relevance,
      })),
    };
  }

  // ─── Model Router ───────────────────────────────────────────

  async getModelStatus(): Promise<ModelStatusResponse> {
    const resp: any = await this.promisify('getModelStatus', {});
    return {
      providers: (resp.providers || []).map((p: any) => ({
        name: p.name, healthy: p.healthy,
        failureRate: p.failure_rate, totalCalls: p.total_calls,
        consecutiveFailures: p.consecutive_failures,
      })),
    };
  }

  // ─── Knowledge Graph ────────────────────────────────────────

  async searchGraph(query: string, entityType?: string, topK?: number): Promise<GraphSearchResult> {
    const resp: any = await this.promisify('searchGraph', {
      query, entity_type: entityType || '', top_k: topK || 10,
    });
    return {
      entities: (resp.entities || []).map((e: any) => ({
        id: e.id, name: e.name, type: e.type,
        description: e.description, confidence: e.confidence,
      })),
    };
  }

  async getNeighbors(entityName: string, depth?: number): Promise<any[]> {
    const resp: any = await this.promisify('getNeighbors', {
      entity_name: entityName, depth: depth || 1,
    });
    return resp.neighbors || [];
  }

  // ─── Health ─────────────────────────────────────────────────

  async health(): Promise<{ status: string; version: string; uptimeSeconds: number }> {
    const resp: any = await this.promisify('health', {});
    return { status: resp.status, version: resp.version, uptimeSeconds: resp.uptime_seconds };
  }
}