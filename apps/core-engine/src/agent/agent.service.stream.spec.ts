import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { GrpcClientService } from '../grpc/grpc-client.service';
import { SSEEvent } from '@deepspace/shared-types';

describe('AgentService - executeStream', () => {
  let service: AgentService;
  let mockGrpcClient: Partial<GrpcClientService>;

  function collectEvents(subject: ReturnType<typeof service.executeStream>): Promise<SSEEvent[]> {
    return new Promise((resolve) => {
      const events: SSEEvent[] = [];
      subject.subscribe({
        next: (e) => events.push(e),
        complete: () => resolve(events),
      });
    });
  }

  beforeEach(async () => {
    mockGrpcClient = {
      interact: jest.fn(),
      interactStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: GrpcClientService, useValue: mockGrpcClient },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should emit session_start, thinking, text_chunk, done for a simple response', async () => {
    const mockChunks = (async function* () {
      yield { type: 'thinking', content: 'Step 1', step: 1 };
      yield { type: 'text_chunk', content: 'Hello from stream!' };
      yield { type: 'done', totalSteps: 1, sessionId: 'sess-1' };
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('Test DNA', 'Hello', 'sess-1', 'user-1');
    const events = await collectEvents(subject);

    const types = events.map((e) => e.type);
    expect(types).toContain('session_start');
    expect(types).toContain('thinking');
    expect(types).toContain('text_chunk');
    expect(types).toContain('done');

    const sessionStart = events.find((e) => e.type === 'session_start');
    expect(sessionStart).toEqual({ type: 'session_start', sessionId: 'sess-1' });

    const textChunk = events.find((e) => e.type === 'text_chunk') as any;
    expect(textChunk.content).toBe('Hello from stream!');
  });

  it('should emit tool_call_start and tool_call_result for tool usage', async () => {
    const mockChunks = (async function* () {
      yield { type: 'thinking', content: 'Step 1', step: 1 };
      yield { type: 'tool_call_start', step: 1, toolName: 'read_file', argsJson: '{"filePath":"test.txt"}' };
      yield { type: 'tool_call_result', step: 1, toolName: 'read_file', result: 'file content', durationMs: 10 };
      yield { type: 'thinking', content: 'Step 2', step: 2 };
      yield { type: 'text_chunk', content: 'Done with file' };
      yield { type: 'done', totalSteps: 2, sessionId: 'sess-1' };
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('DNA', 'Read a file', 'sess-2', 'user-1');
    const events = await collectEvents(subject);

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call_start');
    expect(types).toContain('tool_call_result');
    expect(types).toContain('done');

    const toolStart = events.find((e) => e.type === 'tool_call_start') as any;
    expect(toolStart.toolName).toBe('read_file');
    expect(toolStart.step).toBe(1);

    const toolResult = events.find((e) => e.type === 'tool_call_result') as any;
    expect(toolResult.toolName).toBe('read_file');
  });

  it('should emit error event on gRPC stream error', async () => {
    const mockChunks = (async function* () {
      throw new Error('GRPC connection refused');
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('DNA', 'Hello', 'sess-1', 'user-1');
    const events = await collectEvents(subject);

    const errorEvent = events.find((e) => e.type === 'error') as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('AGENT_ERROR');
  });

  it('should emit error event from Python engine', async () => {
    const mockChunks = (async function* () {
      yield { type: 'error', code: 'LLM_AUTH_ERROR', message: 'Invalid API key' };
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('DNA', 'Hello', 'sess-1', 'user-1');
    const events = await collectEvents(subject);

    const errorEvent = events.find((e) => e.type === 'error') as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('LLM_AUTH_ERROR');
    expect(errorEvent.message).toBe('Invalid API key');
  });

  it('should handle Python engine timeout error', async () => {
    const mockChunks = (async function* () {
      yield { type: 'error', code: 'LLM_TIMEOUT', message: 'Request timed out' };
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('DNA', 'Hello', 'sess-4', 'user-1');
    const events = await collectEvents(subject);

    const errorEvent = events.find((e) => e.type === 'error') as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('LLM_TIMEOUT');
  });

  it('should pass session ID to gRPC request', async () => {
    const mockChunks = (async function* () {
      yield { type: 'done', totalSteps: 1, sessionId: 'sess-6' };
    })();
    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const subject = service.executeStream('DNA', 'New msg', 'sess-6', 'user-1');
    await collectEvents(subject);

    expect(mockGrpcClient.interactStream).toHaveBeenCalledWith({
      dna: 'DNA',
      message: 'New msg',
      sessionId: 'sess-6',
      userId: 'user-1',
      modelId: undefined,
      toolNames: ['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run'],
    });
  });
});