import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluginManifest, PluginInfo } from './plugin-schema';
import { ToolRegistry } from '../agent/tools/tool-registry';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DynamicStructuredTool } from '@langchain/core/tools';

@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private plugins: Map<string, PluginInfo> = new Map();
  private loadedTools: Map<string, DynamicStructuredTool> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async onModuleInit() {
    if (process.env.PLUGINS_DISABLED === 'true') {
      this.logger.log('Plugins disabled via PLUGINS_DISABLED env var');
      return;
    }
    await this.loadAllBuiltinPlugins();
  }

  private getPluginsDir(): string {
    return (
      this.configService.get<string>('PLUGINS_DIR') ||
      path.resolve(process.cwd(), '../../plugins')
    );
  }

  private getBuiltinPluginsDir(): string {
    return path.resolve(__dirname, '../../plugins');
  }

  async loadAllBuiltinPlugins(): Promise<PluginInfo[]> {
    const results: PluginInfo[] = [];
    const dirs = [this.getPluginsDir(), this.getBuiltinPluginsDir()];

    for (const pluginsDir of dirs) {
      try {
        await fs.access(pluginsDir);
      } catch {
        this.logger.debug(`Plugins directory not found: ${pluginsDir}`);
        continue;
      }

      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginPath = path.join(pluginsDir, entry.name);
        const manifestPath = path.join(pluginPath, 'plugin.json');

        try {
          await fs.access(manifestPath);
        } catch {
          this.logger.debug(`No plugin.json at ${pluginPath}, skipping`);
          continue;
        }

        try {
          const info = await this.loadPlugin(pluginPath);
          if (info) results.push(info);
        } catch (err: any) {
          this.logger.warn(`Failed to load plugin from ${pluginPath}: ${err.message}`);
        }
      }
    }

    return results;
  }

  async loadPlugin(dirPath: string): Promise<PluginInfo | null> {
    const manifestPath = path.join(dirPath, 'plugin.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(raw);

    if (manifest.enabled === false) {
      this.logger.debug(`Plugin ${manifest.id} is disabled`);
      return null;
    }

    const toolsDir = path.join(dirPath, 'tools');
    let toolCount = 0;

    try {
      await fs.access(toolsDir);
      const toolFiles = await fs.readdir(toolsDir);
      const jsToolFiles = toolFiles.filter(
        (f) => f.endsWith('.tool.js') || f.endsWith('.tool.ts'),
      );

      for (const toolFile of jsToolFiles) {
        try {
          const tool = await this.loadToolFile(path.join(toolsDir, toolFile));
          if (tool) {
            this.toolRegistry.register(tool);
            this.loadedTools.set(tool.name, tool);
            toolCount++;
          }
        } catch (err: any) {
          this.logger.warn(
            `Failed to load tool ${toolFile} from plugin ${manifest.id}: ${err.message}`,
          );
        }
      }
    } catch {
      this.logger.debug(`No tools directory in ${manifest.id}`);
    }

    const info: PluginInfo = {
      manifest,
      dirPath,
      enabled: true,
      toolCount,
      loadedAt: Date.now(),
    };

    this.plugins.set(manifest.id, info);
    this.logger.log(
      `Loaded plugin "${manifest.name}" (${manifest.id}) with ${toolCount} tools`,
    );

    return info;
  }

  private async loadToolFile(
    filePath: string,
  ): Promise<DynamicStructuredTool | null> {
    // Dynamic import for .js tool files
    const mod = await import(filePath);
    const toolFactory = mod.default || mod.tool || mod;

    if (typeof toolFactory !== 'function') {
      // If it's already a tool instance, return it
      if (toolFactory?.name && toolFactory?.invoke) {
        return toolFactory;
      }
      return null;
    }

    const tool = toolFactory();
    if (tool && typeof tool.name === 'string' && typeof tool.invoke === 'function') {
      return tool;
    }

    return null;
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    const info = this.plugins.get(pluginId);
    if (!info) return false;

    // Remove all tools registered by this plugin
    const manifestPath = path.join(info.dirPath, 'plugin.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(raw);

    for (const toolName of manifest.tools) {
      this.toolRegistry.remove(toolName);
      this.loadedTools.delete(toolName);
    }

    this.plugins.delete(pluginId);
    this.logger.log(`Unloaded plugin "${info.manifest.name}" (${pluginId})`);
    return true;
  }

  async reloadPlugin(pluginId: string): Promise<PluginInfo | null> {
    const info = this.plugins.get(pluginId);
    if (!info) return null;

    await this.unloadPlugin(pluginId);
    return this.loadPlugin(info.dirPath);
  }

  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId);
  }

  getToolNames(pluginId: string): string[] {
    const loadedToolNames: string[] = [];
    for (const [toolName] of this.loadedTools) {
      loadedToolNames.push(toolName);
    }

    const info = this.plugins.get(pluginId);
    if (!info) return [];

    // 返回该插件注册的工具名
    return loadedToolNames.filter((name) => {
      // 检查该工具是否属于此插件（通过 manifest.tools）
      return info.manifest.tools.includes(name) ||
        this.loadedTools.has(name) && info.manifest.tools.some(
          (t) => name.startsWith(t),
        );
    });
  }

  async togglePlugin(pluginId: string, enabled: boolean): Promise<PluginInfo | null> {
    const info = this.plugins.get(pluginId);
    if (!info) return null;

    if (enabled === info.enabled) return info;

    if (enabled) {
      return this.reloadPlugin(pluginId);
    }

    // 禁用：卸载工具但保留 PluginInfo
    for (const toolName of info.manifest.tools) {
      this.toolRegistry.remove(toolName);
      this.loadedTools.delete(toolName);
    }
    info.enabled = false;
    info.toolCount = 0;

    this.logger.log(`Plugin "${info.manifest.name}" disabled`);
    return info;
  }

  async installPlugin(dirPath: string): Promise<PluginInfo | null> {
    const fs = require('fs/promises');
    const manifestPath = require('path').join(dirPath, 'plugin.json');

    try {
      await fs.access(manifestPath);
    } catch {
      this.logger.warn(`No plugin.json found at ${dirPath}`);
      return null;
    }

    return this.loadPlugin(dirPath);
  }
}
