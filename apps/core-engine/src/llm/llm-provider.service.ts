import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import type { ModelInfo } from '@deepspace/shared-types';

interface ModelConfig {
  info: ModelInfo;
  apiKeyEnv: string;
  baseURL: string;
  modelName: string;
}

const MODEL_REGISTRY: ModelConfig[] = [
  {
    info: {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      provider: 'DashScope',
      description: '通义千问 Plus，通用对话与编程',
      maxTokens: 8192,
      isDefault: true,
    },
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
  },
  {
    info: {
      id: 'qwen-max',
      name: 'Qwen Max',
      provider: 'DashScope',
      description: '通义千问 Max，更强推理能力',
      maxTokens: 8192,
    },
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-max',
  },
  {
    info: {
      id: 'qwen-coder',
      name: 'Qwen Coder',
      provider: 'DashScope',
      description: '通义千问代码专用模型',
      maxTokens: 16384,
    },
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-coder-plus',
  },
  {
    info: {
      id: 'openai-gpt4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      description: '快速且经济高效的 OpenAI 模型',
      maxTokens: 16384,
    },
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
  },
  {
    info: {
      id: 'openai-gpt4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      description: 'OpenAI 旗舰多模态模型',
      maxTokens: 16384,
    },
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
  },
];

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  getAvailableModels(): ModelInfo[] {
    return MODEL_REGISTRY.filter((cfg) =>
      this.configService.get<string>(cfg.apiKeyEnv),
    ).map((cfg) => cfg.info);
  }

  createModel(modelId?: string, temperature = 0.7): ChatOpenAI {
    const config = this.resolveConfig(modelId);

    const apiKey = this.configService.get<string>(config.apiKeyEnv);
    if (!apiKey) {
      throw new Error(
        `API key not configured for ${config.info.provider} (${config.apiKeyEnv})`,
      );
    }

    this.logger.debug(`Creating model: ${config.info.name}`);

    return new ChatOpenAI({
      modelName: config.modelName,
      temperature,
      apiKey,
      configuration: {
        baseURL: config.baseURL,
      },
    });
  }

  getDefaultModelId(): string {
    const defaultModel = MODEL_REGISTRY.find((c) => c.info.isDefault);
    return defaultModel?.info.id || MODEL_REGISTRY[0].info.id;
  }

  private resolveConfig(modelId?: string): ModelConfig {
    if (modelId) {
      const found = MODEL_REGISTRY.find((c) => c.info.id === modelId);
      if (found) return found;
      this.logger.warn(`Unknown model "${modelId}", falling back to default`);
    }

    const defaultConfig = MODEL_REGISTRY.find((c) => c.info.isDefault);
    return defaultConfig || MODEL_REGISTRY[0];
  }
}
