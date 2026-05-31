import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { SessionModule } from './session/session.module';
import { ConversationModule } from './conversation/conversation.module';
import { LlmModule } from './llm/llm.module';
import { TemplateModule } from './template/template.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { TraceModule } from './trace/trace.module';
import { CollabModule } from './collab/collab.module';
import { ShareModule } from './share/share.module';
import { PluginsModule } from './plugins/plugins.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { GrpcModule } from './grpc/grpc.module';
import { MemoryModule } from './memory/memory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
    GrpcModule,
    MemoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
export class AppModule {}
