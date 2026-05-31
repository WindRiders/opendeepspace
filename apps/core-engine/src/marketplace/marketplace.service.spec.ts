import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => {
              if (key === 'MARKETPLACE_DB_PATH') return ':memory:';
              return fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('publishAgent', () => {
    it('should publish an agent with required fields', () => {
      const agent = service.publishAgent('Test Agent', 'A test agent', 'dna content', 'user1');

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test Agent');
      expect(agent.description).toBe('A test agent');
      expect(agent.dna).toBe('dna content');
      expect(agent.author).toBe('user1');
      expect(agent.stars).toBe(0);
      expect(agent.downloads).toBe(0);
      expect(agent.tags).toEqual([]);
    });

    it('should publish an agent with tags and modelId', () => {
      const agent = service.publishAgent(
        'Agent', 'desc', 'dna', 'user1',
        ['tag1', 'tag2'], 'qwen-plus',
      );

      expect(agent.tags).toEqual(['tag1', 'tag2']);
      expect(agent.modelId).toBe('qwen-plus');
    });
  });

  describe('listAgents', () => {
    it('should list all agents ordered by stars', () => {
      service.publishAgent('Agent A', 'desc', 'dna', 'user1');
      const agentB = service.publishAgent('Agent B', 'desc', 'dna', 'user2');
      service.starAgent(agentB.id);

      const agents = service.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('Agent B');
      expect(agents[0].stars).toBe(1);
    });

    it('should filter by search query', () => {
      service.publishAgent('Python Expert', 'Python coding', 'dna', 'user1');
      service.publishAgent('Java Expert', 'Java coding', 'dna', 'user1');
      service.publishAgent('DevOps Tool', 'Deployment tool', 'dna', 'user2');

      const results = service.listAgents('python');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Python Expert');
    });

    it('should filter by tag', () => {
      service.publishAgent('Agent A', 'desc', 'dna', 'user1', ['coding']);
      service.publishAgent('Agent B', 'desc', 'dna', 'user2', ['writing']);

      const results = service.listAgents(undefined, 'coding');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Agent A');
    });

    it('should return empty array when no agents exist', () => {
      expect(service.listAgents()).toEqual([]);
    });
  });

  describe('getAgent', () => {
    it('should get an agent by id', () => {
      const published = service.publishAgent('Target', 'desc', 'dna', 'user1');
      const agent = service.getAgent(published.id);

      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('Target');
    });

    it('should return null for non-existent agent', () => {
      expect(service.getAgent('nonexistent')).toBeNull();
    });
  });

  describe('starAgent', () => {
    it('should increment star count', () => {
      const agent = service.publishAgent('Star Me', 'desc', 'dna', 'user1');

      service.starAgent(agent.id);
      service.starAgent(agent.id);

      const updated = service.getAgent(agent.id);
      expect(updated!.stars).toBe(2);
    });

    it('should return null for non-existent agent', () => {
      expect(service.starAgent('nonexistent')).toBeNull();
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent by id and author', () => {
      const agent = service.publishAgent('Delete Me', 'desc', 'dna', 'user1');

      const deleted = service.deleteAgent(agent.id, 'user1');
      expect(deleted).toBe(true);
      expect(service.getAgent(agent.id)).toBeNull();
    });

    it('should not delete agent of another author', () => {
      const agent = service.publishAgent('Mine', 'desc', 'dna', 'user1');

      const deleted = service.deleteAgent(agent.id, 'other-user');
      expect(deleted).toBe(false);
      expect(service.getAgent(agent.id)).not.toBeNull();
    });

    it('should return false for non-existent agent', () => {
      expect(service.deleteAgent('nonexistent', 'user1')).toBe(false);
    });
  });

  describe('downloadAgent', () => {
    it('should increment download count', () => {
      const agent = service.publishAgent('DL Agent', 'desc', 'dna', 'user1');

      service.downloadAgent(agent.id);
      service.downloadAgent(agent.id);
      service.downloadAgent(agent.id);

      const updated = service.getAgent(agent.id);
      expect(updated!.downloads).toBe(3);
    });

    it('should return null for non-existent agent', () => {
      expect(service.downloadAgent('nonexistent')).toBeNull();
    });
  });

  describe('listAgents pagination', () => {
    it('should support limit', () => {
      for (let i = 0; i < 5; i++) {
        service.publishAgent(`Agent ${i}`, 'desc', 'dna', 'user1');
      }

      const result = service.listAgents(undefined, undefined, 3, 0);
      expect(result).toHaveLength(3);
    });

    it('should support offset', () => {
      for (let i = 0; i < 5; i++) {
        service.publishAgent(`Agent ${i}`, 'desc', 'dna', 'user1');
      }

      const result = service.listAgents(undefined, undefined, 10, 3);
      expect(result).toHaveLength(2);
    });
  });
});