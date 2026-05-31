import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CollabSessionStore } from './collab-session.store';
import { OrchestratorService } from './orchestrator.service';
import { CollabController } from './collab.controller';
import { CollabGateway } from './collab.gateway';

@Module({
  imports: [ConfigModule, JwtModule],
  providers: [CollabSessionStore, OrchestratorService, CollabGateway],
  controllers: [CollabController],
  exports: [OrchestratorService, CollabGateway],
})
export class CollabModule {}
