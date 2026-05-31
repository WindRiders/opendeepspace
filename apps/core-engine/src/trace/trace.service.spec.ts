import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TraceService } from './trace.service';

describe('TraceService', () => {
  let service: TraceService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => {
              if (key === 'TRACE_DB_PATH') return ':memory:';
              if (key === 'MAX_TRACES_PER_SESSION') return '50';
              return fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get<TraceService>(TraceService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('saveTrace / getTrace', () => {
    it('should save and retrieve a trace', () => {
      const steps = [
        { type: 'thinking' as const, step: 1, content: 'Thinking...', timestamp: Date.now() },
        { type: 'tool_call' as const, step: 1, toolName: 'read_file', args: { path: 'test.txt' }, result: 'ok', durationMs: 150, timestamp: Date.now() },
      ];

      service.saveTrace('trace-1', userId, 'sess-1', 'Hello', 'World', steps, 2, 300, 'qwen', 'expert');

      const trace = service.getTrace('trace-1', userId);
      expect(trace).not.toBeNull();
      expect(trace?.id).toBe('trace-1');
      expect(trace?.sessionId).toBe('sess-1');
      expect(trace?.userMessage).toBe('Hello');
      expect(trace?.agentReply).toBe('World');
      expect(trace?.steps).toHaveLength(2);
      expect(trace?.totalSteps).toBe(2);
      expect(trace?.modelId).toBe('qwen');
      expect(trace?.dna).toBe('expert');
    });

    it('should return null for non-existent trace', () => {
      expect(service.getTrace('nope', userId)).toBeNull();
    });

    it('should return null for wrong user', () => {
      service.saveTrace('trace-2', userId, 'sess-1', 'Hi', 'Hey', [], 1, 50);
      expect(service.getTrace('trace-2', 'other-user')).toBeNull();
    });

    it('should replace existing trace on same ID', () => {
      service.saveTrace('trace-3', userId, 'sess-1', 'First', 'Reply1', [], 1, 100);
      service.saveTrace('trace-3', userId, 'sess-1', 'Second', 'Reply2', [], 2, 200);

      const trace = service.getTrace('trace-3', userId);
      expect(trace?.userMessage).toBe('Second');
      expect(trace?.totalSteps).toBe(2);
    });
  });

  describe('listTraces', () => {
    it('should list all traces for user', () => {
      service.saveTrace('t1', userId, 'sess-a', 'Msg1', 'Reply1', [], 1, 100);
      service.saveTrace('t2', userId, 'sess-b', 'Msg2', 'Reply2', [], 2, 200);

      const traces = service.listTraces(userId);
      expect(traces).toHaveLength(2);
      expect(traces.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    });

    it('should filter by sessionId', () => {
      service.saveTrace('t1', userId, 'sess-a', 'Msg1', 'Reply1', [], 1, 100);
      service.saveTrace('t2', userId, 'sess-b', 'Msg2', 'Reply2', [], 2, 200);

      const traces = service.listTraces(userId, 'sess-a');
      expect(traces).toHaveLength(1);
      expect(traces[0].id).toBe('t1');
    });

    it('should truncate long messages to 100 chars', () => {
      service.saveTrace('t1', userId, 'sess-1', 'A'.repeat(200), 'Reply', [], 1, 100);

      const traces = service.listTraces(userId);
      expect(traces[0].userMessage).toHaveLength(103); // 100 + "..."
      expect(traces[0].userMessage).toMatch(/\.\.\.$/);
    });

    it('should compute toolCount from steps', () => {
      const steps = [
        { type: 'tool_call' as const, step: 1, toolName: 'a', args: {}, result: 'ok', durationMs: 10, timestamp: 0 },
        { type: 'thinking' as const, step: 2, content: 'think', timestamp: 0 },
        { type: 'tool_call' as const, step: 3, toolName: 'b', args: {}, result: 'ok', durationMs: 10, timestamp: 0 },
      ];
      service.saveTrace('t1', userId, 'sess-1', 'Msg', 'Reply', steps, 3, 100);

      const traces = service.listTraces(userId);
      expect(traces[0].toolCount).toBe(2);
    });

    it('should isolate by user', () => {
      service.saveTrace('t1', userId, 'sess-1', 'Msg', 'Reply', [], 1, 100);
      service.saveTrace('t2', 'other', 'sess-1', 'Msg', 'Reply', [], 1, 100);

      expect(service.listTraces(userId)).toHaveLength(1);
    });
  });

  describe('deleteTrace', () => {
    it('should delete a trace', () => {
      service.saveTrace('t1', userId, 'sess-1', 'Msg', 'Reply', [], 1, 100);
      const ok = service.deleteTrace('t1', userId);

      expect(ok).toBe(true);
      expect(service.getTrace('t1', userId)).toBeNull();
    });

    it('should return false for non-existent trace', () => {
      expect(service.deleteTrace('nope', userId)).toBe(false);
    });

    it('should not delete another user trace', () => {
      service.saveTrace('t1', userId, 'sess-1', 'Msg', 'Reply', [], 1, 100);
      expect(service.deleteTrace('t1', 'other')).toBe(false);
      expect(service.getTrace('t1', userId)).not.toBeNull();
    });
  });
});