import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CollabSessionStore } from './collab-session.store';
import { OrchestratorService } from './orchestrator.service';
import { GrpcClientService } from '../grpc/grpc-client.service';
import type { CollabSSEEvent } from '@deepspace/shared-types';

async function collectStream(
  gen: AsyncGenerator<CollabSSEEvent>,
): Promise<CollabSSEEvent[]> {
  const events: CollabSSEEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  const userId = 'user-1';

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        CollabSessionStore,
        OrchestratorService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => {
              if (key === 'COLLAB_DB_PATH') return ':memory:';
              return fallback;
            },
          },
        },
        {
          provide: GrpcClientService,
          useValue: {
            solve: jest.fn().mockResolvedValue({ plan: [], outcome: 'success' }),
            solveStream: jest.fn(),
          },
        },
      ],
    }).compile();

    service = mod.get<OrchestratorService>(OrchestratorService);
    const store = mod.get<CollabSessionStore>(CollabSessionStore);
    store.onModuleInit();
  });

  describe('getAvailableRoles', () => {
    it('should return 4 roles', () => {
      const roles = service.getAvailableRoles();
      expect(roles).toHaveLength(4);
      expect(roles.map((r) => r.role)).toEqual(['planner', 'coder', 'reviewer', 'researcher']);
    });
  });

  describe('getRoleConfig', () => {
    it('should return planner config', () => {
      const cfg = service.getRoleConfig('planner');
      expect(cfg?.role).toBe('planner');
      expect(cfg?.name).toBe('Planner');
    });

    it('should return undefined for unknown role', () => {
      expect(service.getRoleConfig('unknown' as any)).toBeUndefined();
    });
  });

  describe('createSession', () => {
    it('should create a session with correct fields', () => {
      const session = service.createSession('Build API', ['planner', 'coder'], userId);
      expect(session.id).toBeDefined();
      expect(session.task).toBe('Build API');
      expect(session.agents).toEqual(['planner', 'coder']);
      expect(session.status).toBe('planning');
      expect(session.messages).toEqual([]);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      const created = service.createSession('Task 1', ['planner'], userId);
      const fetched = service.getSession(created.id, userId);
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.task).toBe('Task 1');
    });

    it('should return null for non-existent session', () => {
      expect(service.getSession('bad-id', userId)).toBeNull();
    });

    it('should return null for wrong user', () => {
      const created = service.createSession('Task 1', ['planner'], userId);
      expect(service.getSession(created.id, 'other-user')).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should list user sessions', () => {
      service.createSession('First', ['planner'], userId);
      service.createSession('Second', ['coder'], userId);
      const sessions = service.listSessions(userId);
      expect(sessions).toHaveLength(2);
    });

    it('should isolate by user', () => {
      service.createSession('User A task', ['planner'], userId);
      service.createSession('User B task', ['planner'], 'user-b');
      expect(service.listSessions(userId)).toHaveLength(1);
    });
  });

  describe('addMessage', () => {
    it('should add a message to a session', () => {
      const session = service.createSession('Task', ['planner', 'coder'], userId);
      const msg = service.addMessage(session.id, userId, 'planner', 'coder', 'Here is the plan', 'handoff');
      expect(msg?.from).toBe('planner');
      expect(msg?.content).toBe('Here is the plan');
      const updated = service.getSession(session.id, userId);
      expect(updated?.messages).toHaveLength(1);
    });

    it('should return null for non-existent session', () => {
      expect(service.addMessage('bad', userId, 'planner', 'coder', 'test', 'task')).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update session status', () => {
      const session = service.createSession('Task', ['planner'], userId);
      expect(service.updateStatus(session.id, userId, 'executing')).toBe(true);
      expect(service.getSession(session.id, userId)?.status).toBe('executing');
    });
  });

  describe('buildHandoffSequence', () => {
    it('should sort agents by priority: planner → researcher → coder → reviewer', () => {
      const sorted = service.buildHandoffSequence(['reviewer', 'coder', 'researcher', 'planner']);
      expect(sorted).toEqual(['planner', 'researcher', 'coder', 'reviewer']);
    });
  });

  describe('planExecution', () => {
    it('should create session with task and handoff messages (async)', async () => {
      const session = await service.planExecution('Build API', ['planner', 'coder'], userId);
      expect(session.status).toBe('planning');
      const types = session.messages.map((m) => m.type);
      expect(types).toContain('task');
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', () => {
      const session = service.createSession('To delete', ['planner'], userId);
      expect(service.deleteSession(session.id, userId)).toBe(true);
      expect(service.getSession(session.id, userId)).toBeNull();
    });
  });

  describe('runSessionStream', () => {
    it('should yield error for non-existent session', async () => {
      const events = await collectStream(service.runSessionStream('bad-sess', userId));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('collab_error');
    });

    it('should proxy to Python solveStream and complete', async () => {
      const session = await service.planExecution('Simple task', ['planner'], userId);

      const mockStream = (async function* () {
        yield { type: 'plan', content: 'Plan created' };
        yield { type: 'step_start', stepIndex: 0, agentRole: 'coder', content: 'Step 1' };
        yield { type: 'step_result', stepIndex: 0, content: 'Done' };
        yield { type: 'done', content: 'All steps complete' };
      })();

      const mockGrpc = (service as any).grpcClient;
      (mockGrpc.solveStream as jest.Mock).mockReturnValue(mockStream);

      const events = await collectStream(service.runSessionStream(session.id, userId));
      const types = events.map((e) => e.type);
      expect(types).toContain('collab_done');

      const updated = service.getSession(session.id, userId);
      expect(updated?.status).toBe('complete');
    });
  });
});