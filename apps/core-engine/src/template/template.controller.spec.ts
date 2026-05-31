import { Test, TestingModule } from '@nestjs/testing';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { NotFoundException } from '@nestjs/common';

describe('TemplateController', () => {
  let controller: TemplateController;
  let service: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateController],
      providers: [TemplateService],
    }).compile();

    controller = module.get<TemplateController>(TemplateController);
    service = module.get<TemplateService>(TemplateService);
  });

  it('should return all templates', () => {
    const templates = controller.getAll();
    expect(templates.length).toBeGreaterThanOrEqual(6);
    expect(templates[0].id).toBeDefined();
    expect(templates[0].dna).toBeDefined();
    expect(templates[0].isBuiltIn).toBe(true);
  });

  it('should return a template by id', () => {
    const template = controller.getById('fullstack-dev');
    expect(template.id).toBe('fullstack-dev');
    expect(template.name).toBe('Full-Stack Developer');
    expect(template.category).toBe('coding');
  });

  it('should throw NotFoundException for unknown id', () => {
    expect(() => controller.getById('nonexistent')).toThrow(NotFoundException);
  });

  it('should filter by category', () => {
    const coding = service.getByCategory('coding');
    expect(coding.length).toBeGreaterThanOrEqual(2);
    coding.forEach((t) => expect(t.category).toBe('coding'));
  });

  it('all templates should have required fields', () => {
    const templates = controller.getAll();
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.dna).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.tags).toBeInstanceOf(Array);
      expect(['coding', 'writing', 'analysis', 'creative', 'utility']).toContain(t.category);
    }
  });
});
