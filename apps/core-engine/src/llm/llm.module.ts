import { Global, Module } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';

@Global()
@Module({
  providers: [LlmProviderService],
  exports: [LlmProviderService],
})
export class LlmModule {}
