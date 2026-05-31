import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Request,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PublishAgentDto } from './dto/publish-agent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  listAgents(
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const l = Math.min(parseInt(limit || '50', 10) || 50, 100);
    const o = parseInt(offset || '0', 10) || 0;
    return this.marketplace.listAgents(search, tag, l, o);
  }

  @Get(':id')
  getAgent(@Param('id') id: string) {
    const agent = this.marketplace.getAgent(id);
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  publishAgent(@Body() dto: PublishAgentDto, @Request() req: any) {
    return this.marketplace.publishAgent(
      dto.name,
      dto.description,
      dto.dna,
      req.user.sub,
      dto.tags || [],
      dto.modelId,
    );
  }

  @Post(':id/star')
  @UseGuards(JwtAuthGuard)
  starAgent(@Param('id') id: string) {
    const agent = this.marketplace.starAgent(id);
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  @Post(':id/download')
  downloadAgent(@Param('id') id: string) {
    const agent = this.marketplace.downloadAgent(id);
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return { downloads: agent.downloads };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteAgent(@Param('id') id: string, @Request() req: any) {
    const deleted = this.marketplace.deleteAgent(id, req.user.sub);
    if (!deleted) throw new NotFoundException(`Agent ${id} not found`);
    return { message: `Agent ${id} deleted.` };
  }
}