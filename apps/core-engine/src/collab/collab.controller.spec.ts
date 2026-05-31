import { Test, TestingModule } from '@nestjs/testing';
import { CollabController } from './collab.controller';
import { CollabSessionStore } from './collab-session.store';
import { OrchestratorService } from './orchestrator.service';
import { ConfigService } from '@nestjs/config';
import { GrpcClientService } from '../grpc/grpc-client.service';
import { NotFoundException } from '@nestjs/common';

const TEST_USER = { user: { sub: 'test-user-001', username: 'tester' } };

describe('CollabController', () => {
  let controller: CollabController;
  let testModule: TestingModule;

  beforeEach(async () => {
    testModule = await Test.createTestingModule({
      controllers: [CollabController],
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

    controller = testModule.get<CollabController>(CollabController);
    const store = testModule.get<CollabSessionStore>(CollabSessionStore);
    store.onModuleInit();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return available roles', () => {
    const roles = controller.getRoles();
    expect(roles).toHaveLength(4);
    expect(roles.map((r) => r.role)).toEqual(['planner', 'coder', 'reviewer', 'researcher']);
  });

  it('should create a collab session with plan', async () => {
    const session = await controller.createSession(
      { task: 'Build a REST API', agents: ['planner', 'coder', 'reviewer'] },
      TEST_USER as any,
    );
    expect(session.id).toBeDefined();
    expect(session.task).toBe('Build a REST API');
    expect(session.agents).toEqual(['planner', 'coder', 'reviewer']);
    expect(session.status).toBe('planning');
  });

  it('should list sessions', async () => {
    await controller.createSession({ task: 'Task 1', agents: ['planner', 'coder'] }, TEST_USER as any);
    await controller.createSession({ task: 'Task 2', agents: ['researcher'] }, TEST_USER as any);
    const sessions = controller.listSessions(TEST_USER as any);
    expect(sessions).toHaveLength(2);
  });

  it('should isolate sessions by user', async () => {
    await controller.createSession({ task: 'Task 1', agents: ['planner'] }, TEST_USER as any);
    await controller.createSession({ task: 'Task 2', agents: ['coder'] }, { user: { sub: 'other-user' } } as any);
    const sessions = controller.listSessions(TEST_USER as any);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].task).toBe('Task 1');
  });

  it('should get session by id', async () => {
    const created = await controller.createSession({ task: 'Test task', agents: ['planner'] }, TEST_USER as any);
    const fetched = controller.getSession(created.id, TEST_USER as any);
    expect(fetched.id).toBe(created.id);
    expect(fetched.task).toBe('Test task');
  });

  it('should throw NotFoundException for missing session', () => {
    expect(() => controller.getSession('nonexistent', TEST_USER as any)).toThrow(NotFoundException);
  });

  it('should add message to session', async () => {
    const session = await controller.createSession({ task: 'Test', agents: ['planner', 'coder'] }, TEST_USER as any);
    const msg = controller.addMessage(
      session.id,
      { from: 'planner', to: 'coder', content: 'Here is the plan...', type: 'handoff' },
      TEST_USER as any,
    );
    expect(msg.from).toBe('planner');
    expect(msg.to).toBe('coder');
    expect(msg.content).toBe('Here is the plan...');
  });

  it('should throw NotFoundException when adding message to missing session', () => {
    expect(() =>
      controller.addMessage('nonexistent', { from: 'planner', to: 'coder', content: 'test', type: 'response' }, TEST_USER as any),
    ).toThrow(NotFoundException);
  });

  it('should delete session', async () => {
    const session = await controller.createSession({ task: 'To delete', agents: ['planner'] }, TEST_USER as any);
    const result = controller.deleteSession(session.id, TEST_USER as any);
    expect(result.message).toContain(session.id);
    expect(() => controller.getSession(session.id, TEST_USER as any)).toThrow(NotFoundException);
  });

  it('should throw NotFoundException when deleting missing session', () => {
    expect(() => controller.deleteSession('nonexistent', TEST_USER as any)).toThrow(NotFoundException);
  });

  it('should build correct handoff sequence', async () => {
    const session = await controller.createSession(
      { task: 'Complex task', agents: ['reviewer', 'coder', 'planner', 'researcher'] },
      TEST_USER as any,
    );
    const handoffs = session.messages.filter((m) => m.type === 'handoff');
    const order = handoffs.map((m) => m.to);
    expect(order).toEqual(['planner', 'researcher', 'coder', 'reviewer']);
  });

  describe('executeStream', () => {
    it('should emit collab_done via SSE for valid session', async () => {
      const grpcClient = testModule.get<GrpcClientService>(GrpcClientService);

      const mockStream = (async function* () {
        yield { type: 'plan', content: 'Plan created' };
        yield { type: 'step_start', stepIndex: 0, agentRole: 'coder', content: 'Executing step 1' };
        yield { type: 'step_result', stepIndex: 0, content: 'Step done' };
        yield { type: 'done', content: 'All done' };
      })();
      (grpcClient.solveStream as jest.Mock).mockReturnValue(mockStream);

      const session = await controller.createSession({ task: 'SSE test', agents: ['planner'] }, TEST_USER as any);

      const events = await new Promise<any[]>((resolve, reject) => {
        const evts: any[] = [];
        controller.executeStream(session.id, undefined, TEST_USER as any).subscribe({
          next: (e) => evts.push(e),
          error: reject,
          complete: () => resolve(evts),
        });
      });

      const types = events.map((e) => e.type);
      expect(types).toContain('collab_agent_start');
      expect(types).toContain('collab_done');
    });

    it('should emit collab_error for non-existent session', async () => {
      const event = await new Promise<any>((resolve) => {
        controller.executeStream('bad-sess', undefined, TEST_USER as any).subscribe({
          next: (e) => resolve(e),
          error: () => resolve({ type: 'collab_error' }),
        });
      });
      expect(event.type).toBe('collab_error');
      expect(event.message).toBe('Session not found');
    });
  });
});