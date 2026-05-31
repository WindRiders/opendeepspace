import { Test, TestingModule } from '@nestjs/testing';
import { CollabSessionStore } from './collab-session.store';
import { CollabGateway } from './collab.gateway';
import { OrchestratorService } from './orchestrator.service';
import { ConfigService } from '@nestjs/config';
import { GrpcClientService } from '../grpc/grpc-client.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';

function mockClient(overrides?: Partial<any>) {
  return {
    id: 'client-1',
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    user: { sub: 'user-1', username: 'tester' },
    ...overrides,
  };
}

describe('CollabGateway', () => {
  let gateway: CollabGateway;
  let orchestrator: OrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollabGateway,
        CollabSessionStore,
        OrchestratorService,
        {
          provide: ConfigService,
          useValue: { get: (_k: string, f: string) => f },
        },
        {
          provide: GrpcClientService,
          useValue: { solve: jest.fn(), solveStream: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
      ],
    })
      .overrideGuard(WsJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    gateway = module.get<CollabGateway>(CollabGateway);
    orchestrator = module.get<OrchestratorService>(OrchestratorService);
    const store = module.get<CollabSessionStore>(CollabSessionStore);
    store.onModuleInit();

    // Mock the WebSocket server
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as any;
  });

  describe('handleConnection', () => {
    it('should log client connection', () => {
      const client = mockClient({ id: 'socket-abc' });
      gateway.handleConnection(client as any);
      // No error thrown = success
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up active users on disconnect', () => {
      const client = mockClient({ id: 'socket-abc' });
      gateway.handleDisconnect(client as any);
      // No error thrown = success
    });
  });

  describe('join-session', () => {
    it('should emit error when session not found', async () => {
      const client = mockClient();

      await gateway.handleJoinSession(client as any, { sessionId: 'bad-sess' });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Session bad-sess not found',
      });
    });

    it('should join client to session room and emit state', async () => {
      const created = orchestrator.createSession('Build API', ['planner', 'coder'], 'user-1');

      const client = mockClient();

      await gateway.handleJoinSession(client as any, { sessionId: created.id });

      expect(client.join).toHaveBeenCalledWith(created.id);
      expect(client.emit).toHaveBeenCalledWith('session-state', expect.objectContaining({
        id: created.id,
        task: 'Build API',
      }));
      expect(gateway.server.to).toHaveBeenCalledWith(created.id);
    });
  });

  describe('leave-session', () => {
    it('should leave room and broadcast online count', async () => {
      const client = mockClient();

      await gateway.handleLeaveSession(client as any, { sessionId: 'sess-xyz' });

      expect(client.leave).toHaveBeenCalledWith('sess-xyz');
      expect(gateway.server.to).toHaveBeenCalledWith('sess-xyz');
    });
  });

  describe('send-message', () => {
    it('should add message and broadcast to session', async () => {
      const created = orchestrator.createSession('Test', ['planner'], 'user-1');

      const client = mockClient();

      await gateway.handleMessage(client as any, {
        sessionId: created.id,
        from: 'planner',
        to: 'coder',
        content: 'Here is a plan',
        type: 'handoff',
      });

      const emitFn = (gateway.server.to as jest.Mock).mock.results[0]?.value?.emit;
      expect(emitFn).toHaveBeenCalledWith('agent-message', expect.objectContaining({
        from: 'planner',
        content: 'Here is a plan',
      }));
    });

    it('should emit error when addMessage fails', async () => {
      const client = mockClient();

      await gateway.handleMessage(client as any, {
        sessionId: 'bad-sess',
        from: 'planner',
        to: 'coder',
        content: 'test',
        type: 'task',
      });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to add message',
      });
    });
  });

  describe('typing', () => {
    it('should broadcast agent-typing to session', () => {
      const client = mockClient();
      const roomEmit = jest.fn();
      client.to.mockReturnValue({ emit: roomEmit });

      gateway.handleTyping(client as any, { sessionId: 'sess-1', agent: 'planner' });

      expect(client.to).toHaveBeenCalledWith('sess-1');
      expect(roomEmit).toHaveBeenCalledWith('agent-typing', {
        sessionId: 'sess-1',
        agent: 'planner',
        clientId: 'client-1',
      });
    });
  });

  describe('stop-typing', () => {
    it('should broadcast agent-stop-typing to session', () => {
      const client = mockClient();
      const roomEmit = jest.fn();
      client.to.mockReturnValue({ emit: roomEmit });

      gateway.handleStopTyping(client as any, { sessionId: 'sess-1', agent: 'planner' });

      expect(client.to).toHaveBeenCalledWith('sess-1');
      expect(roomEmit).toHaveBeenCalledWith('agent-stop-typing', {
        sessionId: 'sess-1',
        agent: 'planner',
      });
    });
  });

  describe('execute-session', () => {
    it('should emit error when session not found', async () => {
      const client = mockClient();

      await gateway.handleExecuteSession(client as any, { sessionId: 'bad-sess' });

      expect(client.emit).toHaveBeenCalledWith('collab-error', {
        sessionId: 'bad-sess',
        message: 'Session bad-sess not found',
      });
    });

    it('should stream agent events through runSessionStream', async () => {
      const created = orchestrator.createSession('Test', ['planner'], 'user-1');

      const mockStream = async function* () {
        yield { type: 'collab_agent_start', sessionId: created.id, agentRole: 'planner', agentName: 'Planner' };
        yield { type: 'collab_agent_chunk', sessionId: created.id, agentRole: 'planner', content: 'partial' };
        yield { type: 'collab_agent_done', sessionId: created.id, agentRole: 'planner', fullContent: 'Plan output' };
        yield { type: 'collab_done', sessionId: created.id, summary: 'Done' };
      };
      (orchestrator as any).runSessionStream = mockStream;

      const client = mockClient();
      const roomEmit = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: roomEmit });

      await gateway.handleExecuteSession(client as any, { sessionId: created.id });

      expect(roomEmit).toHaveBeenCalledWith('collab-agent-start', expect.any(Object));
      expect(roomEmit).toHaveBeenCalledWith('collab-agent-chunk', expect.any(Object));
      expect(roomEmit).toHaveBeenCalledWith('collab-agent-done', expect.any(Object));
      expect(roomEmit).toHaveBeenCalledWith('collab-done', expect.any(Object));
      expect(roomEmit).toHaveBeenCalledWith('session-updated', {
        sessionId: created.id,
        status: 'executing',
      });
      expect(roomEmit).toHaveBeenCalledWith('session-updated', {
        sessionId: created.id,
        status: 'complete',
      });
    });

    it('should catch and emit collab-error on stream failure', async () => {
      const created = orchestrator.createSession('Test', ['planner'], 'user-1');

      (orchestrator as any).runSessionStream = async function* () {
        throw new Error('LLM unavailable');
      };

      const client = mockClient();
      const roomEmit = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: roomEmit });

      await gateway.handleExecuteSession(client as any, { sessionId: created.id });

      expect(roomEmit).toHaveBeenCalledWith('collab-error', {
        sessionId: created.id,
        message: 'Execution failed: LLM unavailable',
      });
    });
  });

  describe('broadcastAgentResponse', () => {
    it('should emit agent-message to session', () => {
      const roomEmit = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: roomEmit });

      gateway.broadcastAgentResponse('sess-1', {
        id: 'msg-1',
        from: 'planner',
        to: 'coder',
        content: 'Hello',
        timestamp: Date.now(),
        type: 'response',
      });

      expect(gateway.server.to).toHaveBeenCalledWith('sess-1');
      expect(roomEmit).toHaveBeenCalledWith('agent-message', expect.objectContaining({
        from: 'planner',
        content: 'Hello',
      }));
    });
  });

  describe('broadcastSessionUpdate', () => {
    it('should emit session-updated to session', () => {
      const roomEmit = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: roomEmit });

      gateway.broadcastSessionUpdate('sess-1', 'executing');

      expect(gateway.server.to).toHaveBeenCalledWith('sess-1');
      expect(roomEmit).toHaveBeenCalledWith('session-updated', {
        sessionId: 'sess-1',
        status: 'executing',
      });
    });
  });
});