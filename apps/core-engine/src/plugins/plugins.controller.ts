import { Controller, Get, Post, Param, Body, NotFoundException, BadRequestException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PluginRegistryService } from './plugin-registry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  @Get()
  listPlugins() {
    return this.pluginRegistry.listPlugins().map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      enabled: p.enabled,
      toolCount: p.toolCount,
      tools: this.pluginRegistry.getToolNames(p.manifest.id),
      loadedAt: p.loadedAt,
    }));
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post(':pluginId/reload')
  async reloadPlugin(@Param('pluginId') pluginId: string) {
    const info = await this.pluginRegistry.reloadPlugin(pluginId);
    if (!info) {
      throw new NotFoundException('Plugin not found');
    }
    return { success: true, pluginId, toolCount: info.toolCount };
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post(':pluginId/toggle')
  async togglePlugin(
    @Param('pluginId') pluginId: string,
    @Body('enabled') enabled: boolean,
  ) {
    const info = await this.pluginRegistry.togglePlugin(pluginId, enabled);
    if (!info) {
      throw new NotFoundException('Plugin not found');
    }
    return {
      success: true,
      pluginId,
      enabled: info.enabled,
      toolCount: info.toolCount,
    };
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('install')
  async installPlugin(@Body('dirPath') dirPath: string) {
    if (!dirPath) {
      throw new BadRequestException('dirPath is required');
    }

    const info = await this.pluginRegistry.installPlugin(dirPath);
    if (!info) {
      throw new BadRequestException('Failed to install plugin — no valid plugin.json found');
    }

    return {
      success: true,
      id: info.manifest.id,
      name: info.manifest.name,
      toolCount: info.toolCount,
    };
  }
}