import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentRole,
  AgentRoleConfig,
  CollabSession,
  CollabSSEEvent,
} from '@deepspace/shared-types';
import { CollabSessionStore } from './collab-session.store';
import { GrpcClientService } from '../grpc/grpc-client.service';

const AGENT_ROLES: AgentRoleConfig[] = [
  {
    role: 'planner', name: 'Planner',
    description: '分析任务、拆分子任务、制定执行计划',
    systemPrompt: 'You are a planning agent. Break down tasks and create clear execution plans.',
    icon: 'clipboard-list',
  },
  {
    role: 'coder', name: 'Coder',
    description: '编写代码、实现功能、修复 Bug',
    systemPrompt: 'You are a coding agent. Write clean, efficient code based on the plan.',
    icon: 'code',
  },
  {
    role: 'reviewer', name: 'Reviewer',
    description: '审查代码质量、发现问题、提出改进建议',
    systemPrompt: 'You are a code review agent. Review code for bugs and security issues.',
    icon: 'search',
  },
  {
    role: 'researcher', name: 'Researcher',
    description: '调研技术方案、收集信息、提供参考',
    systemPrompt: 'You are a research agent. Gather information and analyze approaches.',
    icon: 'book-open',
  },
];

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly store: CollabSessionStore,
    private readonly grpcClient: GrpcClientService,
  ) {}

  getAvailableRoles(): AgentRoleConfig[] {
    return AGENT_ROLES;
  }

  getRoleConfig(role: AgentRole): AgentRoleConfig | undefined {
    return AGENT_ROLES.find((r) => r.role === role);
  }

  createSession(task: string, agents: AgentRole[], userId: string): CollabSession {
    return this.store.createSession(task, agents, userId);
  }

  getSession(sessionId: string, userId: string): CollabSession | null {
    return this.store.getSession(sessionId, userId);
  }

  listSessions(userId: string): CollabSession[] {
    return this.store.listSessions(userId);
  }

  addMessage(sessionId: string, userId: string, from: string, to: string, content: string, type: string) {
    return this.store.addMessage(sessionId, userId, from as any, to as any, content, type as any);
  }

  updateStatus(sessionId: string, userId: string, status: CollabSession['status']): boolean {
    return this.store.updateStatus(sessionId, userId, status);
  }

  deleteSession(sessionId: string, userId: string): boolean {
    return this.store.deleteSession(sessionId, userId);
  }

  buildHandoffSequence(agents: AgentRole[]): AgentRole[] {
    const priority: Record<AgentRole, number> = {
      planner: 0, researcher: 1, coder: 2, reviewer: 3,
    };
    return [...agents].sort((a, b) => (priority[a] ?? 99) - (priority[b] ?? 99));
  }

  /**
   * Plan execution — proxy to Python Orchestrator.solve (plan_only mode).
   */
  async planExecution(task: string, agents: AgentRole[], userId: string): Promise<CollabSession> {
    const session = this.createSession(task, agents, userId);

    try {
      const result = await this.grpcClient.solve({
        goal: task,
        context: `Agents: ${agents.join(', ')}`,
        mode: 'plan_only',
        userId,
      });

      const planText = result.plan.map((s: any) =>
        `${s.index + 1}. [${s.actionType}] ${s.description}`
      ).join('\n') || 'Plan created by Python engine.';

      this.store.addMessage(session.id, userId, 'orchestrator', 'all', planText, 'task');
    } catch (err: any) {
      this.logger.warn(`Python orchestrator unavailable, using local plan: ${err.message}`);
      // Fallback: local plan generation
      this.store.addMessage(
        session.id, userId, 'orchestrator', 'all',
        `Task: "${task}"\nAgents: ${agents.join(', ')}\nExecution will proceed in sequence.`,
        'task',
      );
    }

    const sequence = this.buildHandoffSequence(agents);
    for (let i = 0; i < sequence.length; i++) {
      const agent = sequence[i];
      const roleConfig = this.getRoleConfig(agent);
      if (!roleConfig) continue;
      const nextAgent = sequence[i + 1];

      this.store.addMessage(
        session.id, userId, 'orchestrator', agent,
        `[${roleConfig.name}] ${roleConfig.description}. ${
          nextAgent ? `Complete and hand off to ${nextAgent}.` : 'Final step. Provide a summary.'
        }`,
        'handoff',
      );
    }

    return this.getSession(session.id, userId)!;
  }

  /**
   * Stream session execution — proxy to Python Orchestrator.solveStream.
   */
  async *runSessionStream(
    sessionId: string,
    userId: string,
    _modelId?: string,
  ): AsyncGenerator<CollabSSEEvent> {
    const session = this.getSession(sessionId, userId);
    if (!session) {
      yield { type: 'collab_error', sessionId, message: 'Session not found' };
      return;
    }

    this.store.updateStatus(sessionId, userId, 'executing');

    try {
      for await (const chunk of this.grpcClient.solveStream({
        goal: session.task,
        context: `Agents: ${session.agents.join(', ')}`,
        mode: 'semi_auto',
        userId,
      })) {
        switch (chunk.type) {
          case 'plan':
            yield { type: 'collab_agent_start', sessionId, agentRole: 'planner' as AgentRole, agentName: 'Python Orchestrator' };
            break;
          case 'step_start':
            yield { type: 'collab_agent_start', sessionId, agentRole: 'coder' as AgentRole, agentName: chunk.agentRole || 'Action' };
            if (chunk.content) {
              yield { type: 'collab_agent_chunk', sessionId, agentRole: 'coder' as AgentRole, content: chunk.content };
            }
            break;
          case 'step_result':
            yield { type: 'collab_agent_done', sessionId, agentRole: 'coder' as AgentRole, fullContent: chunk.content || '' };
            break;
          case 'verify':
            yield { type: 'collab_agent_chunk', sessionId, agentRole: 'reviewer' as AgentRole, content: chunk.content || '' };
            break;
          case 'done':
            this.store.updateStatus(sessionId, userId, 'complete');
            this.store.addMessage(sessionId, userId, 'orchestrator', 'all', chunk.content || 'Execution complete', 'summary');
            yield { type: 'collab_done', sessionId, summary: chunk.content || '' };
            return;
        }
      }
    } catch (err: any) {
      this.logger.error(`Orchestrator stream error: ${err.message}`);
      this.store.updateStatus(sessionId, userId, 'error');
      yield { type: 'collab_error', sessionId, message: `Orchestration error: ${err.message}` };
      return;
    }

    this.store.updateStatus(sessionId, userId, 'complete');
    yield { type: 'collab_done', sessionId, summary: 'Execution complete' };
  }
}