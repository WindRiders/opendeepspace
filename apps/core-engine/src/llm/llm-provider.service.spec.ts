import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmProviderService } from './llm-provider.service';

describe('LlmProviderService', () => {
  let service: LlmProviderService;

  describe('with DASHSCOPE_API_KEY configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LlmProviderService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'DASHSCOPE_API_KEY') return 'sk-test-key';
                return undefined;
              },
            },
          },
        ],
      }).compile();

      service = module.get<LlmProviderService>(LlmProviderService);
    });

    it('should return qwen models when DASHSCOPE_API_KEY is set', () => {
      const models = service.getAvailableModels();
      const qwenModels = models.filter((m) => m.provider === 'DashScope');
      expect(qwenModels.length).toBeGreaterThan(0);
      expect(qwenModels.map((m) => m.id)).toContain('qwen-plus');
    });

    it('should not return OpenAI models without OPENAI_API_KEY', () => {
      const models = service.getAvailableModels();
      const openaiModels = models.filter((m) => m.provider === 'OpenAI');
      expect(openaiModels).toEqual([]);
    });

    it('should have qwen-plus as default', () => {
      const models = service.getAvailableModels();
      const defaultModel = models.find((m) => m.isDefault);
      expect(defaultModel?.id).toBe('qwen-plus');
    });

    it('getDefaultModelId should return qwen-plus', () => {
      expect(service.getDefaultModelId()).toBe('qwen-plus');
    });

    it('should throw when creating model with unconfigured API key', () => {
      expect(() => service.createModel('openai-gpt4o')).toThrow(
        'API key not configured for OpenAI',
      );
    });
  });

  describe('without any API keys', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LlmProviderService,
          {
            provide: ConfigService,
            useValue: {
              get: () => undefined,
            },
          },
        ],
      }).compile();

      service = module.get<LlmProviderService>(LlmProviderService);
    });

    it('should return empty model list', () => {
      const models = service.getAvailableModels();
      expect(models).toEqual([]);
    });

    it('should still return default model id from registry', () => {
      expect(service.getDefaultModelId()).toBe('qwen-plus');
    });
  });

  describe('with OPENAI_API_KEY configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LlmProviderService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'OPENAI_API_KEY') return 'sk-openai-key';
                return undefined;
              },
            },
          },
        ],
      }).compile();

      service = module.get<LlmProviderService>(LlmProviderService);
    });

    it('should return only OpenAI models', () => {
      const models = service.getAvailableModels();
      expect(models.every((m) => m.provider === 'OpenAI')).toBe(true);
      expect(models.length).toBe(2);
    });
  });

  describe('createModel', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LlmProviderService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'DASHSCOPE_API_KEY') return 'sk-test-key';
                return undefined;
              },
            },
          },
        ],
      }).compile();

      service = module.get<LlmProviderService>(LlmProviderService);
    });

    it('should create ChatOpenAI for qwen-plus', () => {
      const model = service.createModel('qwen-plus');
      expect(model).toBeDefined();
    });

    it('should fallback to default for unknown modelId', () => {
      const model = service.createModel('unknown-model');
      expect(model).toBeDefined();
    });

    it('should use provided modelId when valid', () => {
      const model = service.createModel('qwen-max');
      expect(model).toBeDefined();
    });

    it('should accept custom temperature', () => {
      const model = service.createModel('qwen-plus', 0.3);
      expect(model).toBeDefined();
    });
  });
});
