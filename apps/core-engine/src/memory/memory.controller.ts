/**
 * MemoryController — exposes Python memory engine capabilities via NestJS REST API.
 */

import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GrpcClientService } from '../grpc/grpc-client.service';

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly grpcClient: GrpcClientService) {}

  @Post('recall')
  async recall(@Body() body: { query: string; layer?: string; project?: string; topK?: number; memoryType?: string; tags?: string[] }) {
    const result = await this.grpcClient.recall({
      query: body.query,
      layer: body.layer,
      project: body.project,
      topK: body.topK || 10,
      memoryType: body.memoryType,
      tags: body.tags,
    });
    return result;
  }

  @Post('remember')
  async remember(@Body() body: { content: string; layer?: string; memoryType?: string; project?: string; tags?: string[] }) {
    const id = await this.grpcClient.remember(
      body.content,
      body.layer,
      body.memoryType,
      body.project,
      body.tags,
    );
    return { memoryId: id };
  }

  @Post('consolidate')
  async consolidate() {
    return this.grpcClient.consolidate();
  }

  @Get('graph/search')
  async searchGraph(@Query('q') query: string, @Query('type') entityType?: string, @Query('topK') topK?: string) {
    return this.grpcClient.searchGraph(query, entityType, topK ? parseInt(topK) : undefined);
  }

  @Get('graph/neighbors')
  async getNeighbors(@Query('entity') entityName: string, @Query('depth') depth?: string) {
    return this.grpcClient.getNeighbors(entityName, depth ? parseInt(depth) : 1);
  }

  @Get('model-status')
  async getModelStatus() {
    return this.grpcClient.getModelStatus();
  }

  @Get('autonomous-status')
  async getAutonomousStatus() {
    return this.grpcClient.getAutonomousStatus();
  }
}