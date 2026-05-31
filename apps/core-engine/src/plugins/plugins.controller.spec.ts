import { Test, TestingModule } from '@nestjs/testing';
import { PluginsController } from './plugins.controller';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginInfo } from './plugin-schema';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
    dirPath: `/fake/${id}`,
    enabled: true,
    toolCount,
    loadedAt: Date.now(),
  };
}

describe('PluginsController', () => {
  let controller: PluginsController;
  let registry: jest.Mocked<PluginRegistryService>;

  beforeEach(async () => {
    const mockRegistry = {
      listPlugins: jest.fn().mockReturnValue([]),
      reloadPlugin: jest.fn().mockResolvedValue(null),
      togglePlugin: jest.fn().mockResolvedValue(null),
      installPlugin: jest.fn().mockResolvedValue(null),
      getToolNames: jest.fn().mockReturnValue([]),
      getPlugin: jest.fn(),
      unloadPlugin: jest.fn(),
      loadPlugin: jest.fn(),
      loadAllBuiltinPlugins: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PluginsController],
      providers: [
        { provide: PluginRegistryService, useValue: mockRegistry },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PluginsController>(PluginsController);
    registry = module.get(PluginRegistryService) as any;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listPlugins', () => {
    it('should return empty list', () => {
      registry.listPlugins.mockReturnValue([]);
      expect(controller.listPlugins()).toEqual([]);
    });

    it('should format plugin list with tools', () => {
      registry.listPlugins.mockReturnValue([
        makePluginInfo('p1', 2),
        makePluginInfo('p2', 5),
      ]);
      registry.getToolNames.mockImplementation((id) =>
        id === 'p1' ? ['echo', 'ping'] : [],
      );

      const result = controller.listPlugins();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'p1',
        name: 'Plugin p1',
        version: '1.0.0',
        description: 'Description for p1',
        author: 'test-author',
        enabled: true,
        toolCount: 2,
        tools: ['echo', 'ping'],
        loadedAt: expect.any(Number),
      });
      expect(result[1].toolCount).toBe(5);
      expect(result[1].tools).toEqual([]);
    });

    it('should handle plugins without author', () => {
      const info = makePluginInfo('p3');
      info.manifest.author = undefined;
      registry.listPlugins.mockReturnValue([info]);

      const result = controller.listPlugins();
      expect(result[0].author).toBeUndefined();
    });
  });

  describe('reloadPlugin', () => {
    it('should throw NotFoundException for non-existent plugin', async () => {
      registry.reloadPlugin.mockResolvedValue(null);

      await expect(controller.reloadPlugin('nonexistent')).rejects.toThrow(NotFoundException);
      expect(registry.reloadPlugin).toHaveBeenCalledWith('nonexistent');
    });

    it('should reload plugin successfully', async () => {
      registry.reloadPlugin.mockResolvedValue(makePluginInfo('test', 3));

      const result = await controller.reloadPlugin('test');
      expect(result).toEqual({ success: true, pluginId: 'test', toolCount: 3 });
    });

    it('should handle reload of plugin with zero tools', async () => {
      registry.reloadPlugin.mockResolvedValue(makePluginInfo('empty', 0));

      const result = await controller.reloadPlugin('empty');
      expect(result).toEqual({ success: true, pluginId: 'empty', toolCount: 0 });
    });
  });

  describe('togglePlugin', () => {
    it('should throw NotFoundException for non-existent plugin', async () => {
      registry.togglePlugin.mockResolvedValue(null);

      await expect(controller.togglePlugin('nonexistent', false)).rejects.toThrow(NotFoundException);
    });

    it('should disable a plugin', async () => {
      const disabled = makePluginInfo('test', 2);
      disabled.enabled = false;
      disabled.toolCount = 0;
      registry.togglePlugin.mockResolvedValue(disabled);

      const result = await controller.togglePlugin('test', false);
      expect(result).toEqual({
        success: true,
        pluginId: 'test',
        enabled: false,
        toolCount: 0,
      });
      expect(registry.togglePlugin).toHaveBeenCalledWith('test', false);
    });
  });

  describe('installPlugin', () => {
    it('should throw BadRequestException when dirPath is missing', async () => {
      await expect(controller.installPlugin('')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when install fails', async () => {
      registry.installPlugin.mockResolvedValue(null);

      await expect(controller.installPlugin('/some/path')).rejects.toThrow(BadRequestException);
    });

    it('should install plugin successfully', async () => {
      registry.installPlugin.mockResolvedValue(makePluginInfo('new-plugin', 3));

      const result = await controller.installPlugin('/some/path');
      expect(result).toEqual({
        success: true,
        id: 'new-plugin',
        name: 'Plugin new-plugin',
        toolCount: 3,
      });
      expect(registry.installPlugin).toHaveBeenCalledWith('/some/path');
    });
  });
});