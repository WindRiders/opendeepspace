import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PluginRegistryService } from './plugin-registry.service';
import { ToolRegistry } from '../agent/tools/tool-registry';
import { PluginInfo } from './plugin-schema';

// 构造完整的 PluginInfo 用于测试
function makePluginInfo(id: string, toolCount = 0): PluginInfo {
  return {
    manifest: {
      id,
      name: `Plugin ${id}`,
      version: '1.0.0',
      description: `Description for ${id}`,
      author: 'test-author',
      enabled: true,
      tools: [],
    },
    dirPath: `/fake/path/${id}`,
    enabled: true,
    toolCount,
    loadedAt: Date.now(),
  };
}

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;
  let toolRegistry: ToolRegistry;

  beforeEach(async () => {
    // 禁用 onModuleInit，避免文件系统扫描
    process.env.PLUGINS_DISABLED = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginRegistryService,
        ToolRegistry,
        {
          provide: ConfigService,
          useValue: { get: () => '/nonexistent/plugins' },
        },
      ],
    }).compile();

    service = module.get<PluginRegistryService>(PluginRegistryService);
    toolRegistry = module.get<ToolRegistry>(ToolRegistry);
    await service.onModuleInit(); // 不会加载任何插件

    delete process.env.PLUGINS_DISABLED;
  });

  describe('listPlugins', () => {
    it('should return empty list initially', () => {
      expect(service.listPlugins()).toEqual([]);
    });

    it('should list manually registered plugins', () => {
      // 通过反射注入插件数据
      (service as any).plugins.set('p1', makePluginInfo('p1', 3));
      (service as any).plugins.set('p2', makePluginInfo('p2', 1));

      const list = service.listPlugins();
      expect(list).toHaveLength(2);
      expect(list[0].manifest.id).toBe('p1');
      expect(list[0].toolCount).toBe(3);
    });
  });

  describe('getPlugin', () => {
    it('should return undefined for non-existent plugin', () => {
      expect(service.getPlugin('nonexistent')).toBeUndefined();
    });

    it('should return plugin by id', () => {
      const info = makePluginInfo('test-plugin', 5);
      (service as any).plugins.set('test-plugin', info);

      const result = service.getPlugin('test-plugin');
      expect(result).toBeDefined();
      expect(result!.manifest.id).toBe('test-plugin');
      expect(result!.toolCount).toBe(5);
    });
  });

  describe('unloadPlugin', () => {
    it('should return false for non-existent plugin', async () => {
      const result = await service.unloadPlugin('nonexistent');
      expect(result).toBe(false);
    });

    it('should remove plugin and its tools', async () => {
      const info = makePluginInfo('to-unload', 2);
      info.manifest.tools = ['tool-a', 'tool-b'];
      (service as any).plugins.set('to-unload', info);

      // 注册一些工具
      const { z } = require('zod');
      const { DynamicStructuredTool } = require('@langchain/core/tools');
      toolRegistry.register(new DynamicStructuredTool({
        name: 'tool-a',
        description: 'Test tool A',
        schema: z.object({}),
        func: async () => 'A',
      }));
      toolRegistry.register(new DynamicStructuredTool({
        name: 'tool-b',
        description: 'Test tool B',
        schema: z.object({}),
        func: async () => 'B',
      }));

      // Mock fs.readFile for unloadPlugin
      const fs = require('fs/promises');
      const origReadFile = fs.readFile;
      fs.readFile = async () => JSON.stringify(info.manifest);

      try {
        const result = await service.unloadPlugin('to-unload');
        expect(result).toBe(true);
        expect(service.getPlugin('to-unload')).toBeUndefined();
        expect(toolRegistry.has('tool-a')).toBe(false);
        expect(toolRegistry.has('tool-b')).toBe(false);
      } finally {
        fs.readFile = origReadFile;
      }
    });
  });

  describe('reloadPlugin', () => {
    it('should return null for non-existent plugin', async () => {
      const result = await service.reloadPlugin('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('togglePlugin', () => {
    it('should return null for non-existent plugin', async () => {
      const result = await service.togglePlugin('nonexistent', true);
      expect(result).toBeNull();
    });

    it('should disable an enabled plugin', async () => {
      const info = makePluginInfo('toggle-test', 2);
      info.manifest.tools = ['tool-a', 'tool-b'];
      (service as any).plugins.set('toggle-test', info);

      toolRegistry.register(
        new (require('@langchain/core/tools').DynamicStructuredTool)({
          name: 'tool-a',
          description: 'A',
          schema: require('zod').object({}),
          func: async () => 'ok',
        }),
      );
      toolRegistry.register(
        new (require('@langchain/core/tools').DynamicStructuredTool)({
          name: 'tool-b',
          description: 'B',
          schema: require('zod').object({}),
          func: async () => 'ok',
        }),
      );
      (service as any).loadedTools.set('tool-a', {});
      (service as any).loadedTools.set('tool-b', {});

      const result = await service.togglePlugin('toggle-test', false);

      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
      expect(result!.toolCount).toBe(0);
      expect(toolRegistry.has('tool-a')).toBe(false);
      expect(toolRegistry.has('tool-b')).toBe(false);
    });

    it('should be a no-op if already in desired state', async () => {
      const info = makePluginInfo('already-enabled', 1);
      (service as any).plugins.set('already-enabled', info);

      const result = await service.togglePlugin('already-enabled', true);
      expect(result).toBe(info);
    });
  });

  describe('getToolNames', () => {
    it('should return empty array for non-existent plugin', () => {
      expect(service.getToolNames('nonexistent')).toEqual([]);
    });
  });

  describe('installPlugin', () => {
    it('should return null when no plugin.json found', async () => {
      const result = await service.installPlugin('/nonexistent/path');
      expect(result).toBeNull();
    });
  });
});