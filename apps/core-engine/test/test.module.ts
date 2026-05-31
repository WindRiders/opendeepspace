import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AgentModule } from '../src/agent/agent.module';
import { AuthModule } from '../src/auth/auth.module';
import { SessionModule } from '../src/session/session.module';
import { ConversationModule } from '../src/conversation/conversation.module';
import { LlmModule } from '../src/llm/llm.module';
import { TemplateModule } from '../src/template/template.module';
import { SandboxModule } from '../src/sandbox/sandbox.module';
import { TraceModule } from '../src/trace/trace.module';
import { CollabModule } from '../src/collab/collab.module';
import { ShareModule } from '../src/share/share.module';
import { PluginsModule } from '../src/plugins/plugins.module';
import { MarketplaceModule } from '../src/marketplace/marketplace.module';

/**
 * Test version of AppModule with throttling disabled for E2E tests.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SessionModule,
    LlmModule,
    AuthModule,
    AgentModule,
    ConversationModule,
    TemplateModule,
    SandboxModule,
    TraceModule,
    CollabModule,
    ShareModule,
    PluginsModule,
    MarketplaceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        skipMissingProperties: false,
      }),
    },
  ],
})
export class TestAppModule {}
