import { Test, TestingModule } from '@nestjs/testing';
import { MemoryController } from './memory.controller';
import { GrpcClientService } from '../grpc/grpc-client.service';

describe('MemoryController', () => {
  let controller: MemoryController;
  let grpcClient: Partial<GrpcClientService>;

  beforeEach(async () => {
    grpcClient = {
      recall: jest.fn().mockResolvedValue({
        memories: [
          { id: 'm1', content: 'test memory', summary: 'summary', layer: 'SHORT_TERM', importance: 0.8 },
        ],
      }),
      remember: jest.fn().mockResolvedValue('mem-1'),
      consolidate: jest.fn().mockResolvedValue({ consolidated: 3 }),
      searchGraph: jest.fn().mockResolvedValue({
        nodes: [{ name: 'Topic', type: 'Concept' }],
        relationships: [],
      }),
      getNeighbors: jest.fn().mockResolvedValue({
        neighbors: [{ name: 'RelatedTopic', type: 'Concept', relationship: 'RELATES_TO' }],
      }),
      getModelStatus: jest.fn().mockResolvedValue({
        providers: [{ name: 'deepseek-chat', healthy: true, failureRate: 0, totalCalls: 100, consecutiveFailures: 0 }],
      }),
      getAutonomousStatus: jest.fn().mockResolvedValue({
        isIdle: true,
        pendingTasks: [],
        activeTask: null,
        dailyCost: 0.05,
        dailyBudget: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [{ provide: GrpcClientService, useValue: grpcClient }],
    }).compile();

    controller = module.get<MemoryController>(MemoryController);
  });

  describe('POST /memory/recall', () => {
    it('should return memories from gRPC recall', async () => {
      const result = await controller.recall({ query: 'test', topK: 5 });
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].id).toBe('m1');
      expect(grpcClient.recall).toHaveBeenCalledWith({
        query: 'test', layer: undefined, project: undefined, topK: 5, memoryType: undefined, tags: undefined,
      });
    });

    it('should default topK to 10', async () => {
      await controller.recall({ query: 'test' });
      expect(grpcClient.recall).toHaveBeenCalledWith({
        query: 'test', layer: undefined, project: undefined, topK: 10, memoryType: undefined, tags: undefined,
      });
    });

    it('should pass optional filters', async () => {
      await controller.recall({
        query: 'test', layer: 'LONG_TERM', project: 'p1', memoryType: 'fact', tags: ['tag1'],
      });
      expect(grpcClient.recall).toHaveBeenCalledWith({
        query: 'test', layer: 'LONG_TERM', project: 'p1', topK: 10, memoryType: 'fact', tags: ['tag1'],
      });
    });
  });

  describe('POST /memory/remember', () => {
    it('should store a memory and return its id', async () => {
      const result = await controller.remember({ content: 'new memory' });
      expect(result).toEqual({ memoryId: 'mem-1' });
      expect(grpcClient.remember).toHaveBeenCalledWith('new memory', undefined, undefined, undefined, undefined);
    });

    it('should pass optional metadata', async () => {
      await controller.remember({
        content: 'fact', layer: 'WORKING', memoryType: 'fact', project: 'p1', tags: ['a'],
      });
      expect(grpcClient.remember).toHaveBeenCalledWith('fact', 'WORKING', 'fact', 'p1', ['a']);
    });
  });

  describe('POST /memory/consolidate', () => {
    it('should trigger consolidation', async () => {
      const result = await controller.consolidate();
      expect(result).toEqual({ consolidated: 3 });
      expect(grpcClient.consolidate).toHaveBeenCalled();
    });
  });

  describe('GET /memory/graph/search', () => {
    it('should search graph by query', async () => {
      const result = await controller.searchGraph('Topic');
      expect(result.nodes).toHaveLength(1);
      expect(grpcClient.searchGraph).toHaveBeenCalledWith('Topic', undefined, undefined);
    });

    it('should pass type filter', async () => {
      await controller.searchGraph('Topic', 'Concept', '5');
      expect(grpcClient.searchGraph).toHaveBeenCalledWith('Topic', 'Concept', 5);
    });
  });

  describe('GET /memory/graph/neighbors', () => {
    it('should get neighbors with default depth', async () => {
      const result = await controller.getNeighbors('Topic');
      expect(result.neighbors).toHaveLength(1);
      expect(grpcClient.getNeighbors).toHaveBeenCalledWith('Topic', 1);
    });

    it('should parse depth from string', async () => {
      await controller.getNeighbors('Topic', '3');
      expect(grpcClient.getNeighbors).toHaveBeenCalledWith('Topic', 3);
    });
  });

  describe('GET /memory/model-status', () => {
    it('should get model status', async () => {
      const result = await controller.getModelStatus();
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].name).toBe('deepseek-chat');
    });
  });

  describe('GET /memory/autonomous-status', () => {
    it('should get autonomous learner status', async () => {
      const result = await controller.getAutonomousStatus();
      expect(result.isIdle).toBe(true);
      expect(result.dailyCost).toBe(0.05);
    });
  });
});