import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { GrpcClientService } from '../grpc/grpc-client.service';

describe('AgentService', () => {
  let service: AgentService;
  let mockGrpcClient: Partial<GrpcClientService>;

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return available tool names', () => {
    expect(service.getToolNames()).toEqual(['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run']);
  });

  it('should return available model list', () => {
    const models = service.getAvailableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBe('deepseek-v4-pro');
    expect(models[0].isDefault).toBe(true);
  });

  it('should proxy execute to gRPC interact', async () => {
    (mockGrpcClient.interact as jest.Mock).mockResolvedValue({
      reply: 'Hello from Python engine',
      toolCalls: [],
      totalSteps: 1,
      sessionId: 'sess-grpc-1',
    });

    const result = await service.execute('Test DNA', 'Hello', 'sess-1', 'user-1');

    expect(mockGrpcClient.interact).toHaveBeenCalledWith({
      dna: 'Test DNA',
      message: 'Hello',
      sessionId: 'sess-1',
      userId: 'user-1',
      modelId: undefined,
      toolNames: ['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run'],
    });
    expect(result.reply).toBe('Hello from Python engine');
    expect(result.sessionId).toBe('sess-grpc-1');
  });

  it('should propagate gRPC errors', async () => {
    (mockGrpcClient.interact as jest.Mock).mockRejectedValue(new Error('GRPC connection refused'));

    await expect(
      service.execute('DNA', 'Hello', 'sess-1', 'user-1'),
    ).rejects.toThrow('GRPC connection refused');
  });

  it('should map tool calls in response', async () => {
    (mockGrpcClient.interact as jest.Mock).mockResolvedValue({
      reply: 'Done',
      toolCalls: [
        { name: 'read_file', argsJson: '{"filePath":"/tmp/test"}', result: 'content', step: 1 },
      ],
      totalSteps: 2,
      sessionId: 'sess-1',
    });

    const result = await service.execute('DNA', 'msg', 's-1', 'u-1');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('read_file');
  });

  it('should create executeStream observable', () => {
    const mockChunks = (async function* () {
      yield { type: 'thinking', content: 'Step 1', step: 1 };
      yield { type: 'text_chunk', content: 'Hello' };
      yield { type: 'done', totalSteps: 1, sessionId: 'sess-1' };
    })();

    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const chunks: any[] = [];
    const stream = service.executeStream('DNA', 'msg', 's-1', 'u-1');
    stream.subscribe({
      next: (c) => chunks.push(c),
      complete: () => {
        expect(chunks[0]).toEqual({ type: 'session_start', sessionId: 'sess-1' });
        expect(chunks[1].type).toBe('thinking');
        expect(chunks[2].type).toBe('text_chunk');
        expect(chunks[3].type).toBe('done');
      },
    });
  });

  it('should handle stream errors', () => {
    const mockChunks = (async function* () {
      throw new Error('Stream broke');
    })();

    (mockGrpcClient.interactStream as jest.Mock).mockReturnValue(mockChunks);

    const chunks: any[] = [];
    const stream = service.executeStream('DNA', 'msg', 's-1', 'u-1');
    stream.subscribe({
      next: (c) => chunks.push(c),
      complete: () => {
        const errorChunk = chunks.find(c => c.type === 'error');
        expect(errorChunk).toBeDefined();
        expect(errorChunk.code).toBe('AGENT_ERROR');
      },
    });
  });

  it('should support clearSession (no-op at gateway)', () => {
    expect(() => service.clearSession('sess-id', 'user-id')).not.toThrow();
  });
});