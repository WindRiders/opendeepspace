import { Module, Global } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';
import { ToolModule } from '../agent/tools/tool.module';

@Global()
@Module({
  imports: [ToolModule],
  controllers: [PluginsController],
  providers: [PluginRegistryService],
  exports: [PluginRegistryService],
})
export class PluginsModule {}
