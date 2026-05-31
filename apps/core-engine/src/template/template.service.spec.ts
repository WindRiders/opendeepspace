import { Test, TestingModule } from '@nestjs/testing';
import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateService],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  describe('getAll', () => {
    it('should return all 6 built-in templates', () => {
      const templates = service.getAll();
      expect(templates).toHaveLength(6);
    });

    it('should mark all templates as builtIn', () => {
      const templates = service.getAll();
      for (const t of templates) {
        expect(t.isBuiltIn).toBe(true);
      }
    });

    it('should return templates with all required fields', () => {
      const templates = service.getAll();
      for (const t of templates) {
        expect(t.id).toBeDefined();
        expect(t.name).toBeDefined();
        expect(t.description).toBeDefined();
        expect(t.dna).toBeDefined();
        expect(t.icon).toBeDefined();
        expect(t.category).toBeDefined();
        expect(t.tags).toBeInstanceOf(Array);
      }
    });
  });

  describe('getById', () => {
    it('should return correct template for known id', () => {
      const t = service.getById('fullstack-dev');
      expect(t?.name).toBe('Full-Stack Developer');
      expect(t?.category).toBe('coding');
    });

    it('should return all 6 templates by id', () => {
      const ids = [
        'fullstack-dev',
        'python-scientist',
        'tech-writer',
        'creative-storyteller',
        'code-reviewer',
        'devops-engineer',
      ];
      for (const id of ids) {
        expect(service.getById(id)).toBeDefined();
      }
    });

    it('should return undefined for unknown id', () => {
      expect(service.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('getByCategory', () => {
    it('should filter by category', () => {
      const coding = service.getByCategory('coding');
      expect(coding).toHaveLength(2);
      expect(coding.map((t) => t.id).sort()).toEqual([
        'code-reviewer',
        'fullstack-dev',
      ]);
    });

    it('should return empty array for unknown category', () => {
      expect(service.getByCategory('unknown')).toEqual([]);
    });

    it('should return all categories present', () => {
      const categories = [
        'coding',
        'analysis',
        'writing',
        'creative',
        'utility',
      ];
      for (const cat of categories) {
        const tpls = service.getByCategory(cat);
        expect(tpls.length).toBeGreaterThan(0);
      }
    });
  });
});
