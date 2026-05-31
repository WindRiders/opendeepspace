import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

const TEST_REQ = { user: { sub: 'tester', username: 'tester' } };

describe('MarketplaceController', () => {
  let controller: MarketplaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
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

    controller = module.get<MarketplaceController>(MarketplaceController);
    const service = module.get<MarketplaceService>(MarketplaceService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('publishAgent', () => {
    it('should publish an agent with valid DTO', () => {
      const agent = controller.publishAgent(
        { name: 'My Agent', description: 'Desc', dna: 'DNA' },
        TEST_REQ as any,
      );

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('My Agent');
      expect(agent.author).toBe('tester');
      expect(agent.tags).toEqual([]);
    });

    it('should publish an agent with tags', () => {
      const agent = controller.publishAgent(
        { name: 'Tagged', description: 'Desc', dna: 'DNA', tags: ['ai', 'code'] },
        TEST_REQ as any,
      );

      expect(agent.tags).toEqual(['ai', 'code']);
    });
  });

  describe('listAgents', () => {
    it('should list all agents', () => {
      controller.publishAgent(
        { name: 'A1', description: 'd1', dna: 'dna1' },
        TEST_REQ as any,
      );
      controller.publishAgent(
        { name: 'A2', description: 'd2', dna: 'dna2' },
        TEST_REQ as any,
      );

      const list = controller.listAgents();
      expect(list).toHaveLength(2);
    });

    it('should filter by search query', () => {
      controller.publishAgent(
        { name: 'Code Helper', description: 'coding', dna: 'x' },
        TEST_REQ as any,
      );
      controller.publishAgent(
        { name: 'Writer', description: 'writing', dna: 'x' },
        TEST_REQ as any,
      );

      const list = controller.listAgents('code');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Code Helper');
    });

    it('should filter by tag', () => {
      controller.publishAgent(
        { name: 'Agent X', description: 'desc', dna: 'x', tags: ['dev'] },
        TEST_REQ as any,
      );
      controller.publishAgent(
        { name: 'Agent Y', description: 'desc', dna: 'x', tags: ['test'] },
        TEST_REQ as any,
      );

      const list = controller.listAgents(undefined, 'dev');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Agent X');
    });

    it('should return empty list when no agents', () => {
      expect(controller.listAgents()).toEqual([]);
    });

    it('should support limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        controller.publishAgent(
          { name: `Agent ${i}`, description: 'd', dna: 'dna' },
          TEST_REQ as any,
        );
      }

      const result = controller.listAgents(undefined, undefined, '2', '1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getAgent', () => {
    it('should get agent by id', () => {
      const created = controller.publishAgent(
        { name: 'Target', description: 'd', dna: 'dna' },
        TEST_REQ as any,
      );

      const agent = controller.getAgent(created.id);
      expect(agent.name).toBe('Target');
    });

    it('should throw NotFoundException for missing agent', () => {
      expect(() => controller.getAgent('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('starAgent', () => {
    it('should star an agent', () => {
      const created = controller.publishAgent(
        { name: 'Star Target', description: 'd', dna: 'dna' },
        TEST_REQ as any,
      );

      const starred = controller.starAgent(created.id);
      expect(starred.stars).toBe(1);
    });

    it('should throw NotFoundException for missing agent', () => {
      expect(() => controller.starAgent('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('downloadAgent', () => {
    it('should increment download count', () => {
      const created = controller.publishAgent(
        { name: 'DL Target', description: 'd', dna: 'dna' },
        TEST_REQ as any,
      );

      const result = controller.downloadAgent(created.id);
      expect(result.downloads).toBe(1);

      const afterSecond = controller.downloadAgent(created.id);
      expect(afterSecond.downloads).toBe(2);
    });

    it('should throw NotFoundException for missing agent', () => {
      expect(() => controller.downloadAgent('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('deleteAgent', () => {
    it('should delete own agent', () => {
      const created = controller.publishAgent(
        { name: 'Delete Me', description: 'd', dna: 'dna' },
        TEST_REQ as any,
      );

      const result = controller.deleteAgent(created.id, TEST_REQ as any);
      expect(result.message).toContain(created.id);
      expect(() => controller.getAgent(created.id)).toThrow(NotFoundException);
    });

    it('should throw NotFoundException when deleting other user agent', () => {
      const created = controller.publishAgent(
        { name: 'Mine', description: 'd', dna: 'dna' },
        TEST_REQ as any,
      );

      expect(() =>
        controller.deleteAgent(created.id, { user: { sub: 'other' } } as any),
      ).toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent agent', () => {
      expect(() =>
        controller.deleteAgent('nonexistent', TEST_REQ as any),
      ).toThrow(NotFoundException);
    });
  });
});