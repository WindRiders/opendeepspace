import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AgentService } from './agent.service';
import { InteractDto } from './dto/interact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { randomUUID } from 'crypto';

const DEFAULT_AGENT_DNA = '你是 DeepSpace 网络中一个富有创造力的智能实体。';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('status')
  getStatus() {
    return {
      status: 'online',
      core: 'DeepSpace Genesis',
      tools: this.agentService.getToolNames(),
      models: this.agentService.getAvailableModels(),
      phase: 2,
    };
  }

  @Get('models')
  getModels() {
    return this.agentService.getAvailableModels();
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('interact')
  async interact(@Body() dto: InteractDto, @Req() req: any) {
    const userId: string = req.user.sub;
    const instruction = dto.dna || DEFAULT_AGENT_DNA;
    const sid = dto.sessionId || randomUUID();

    try {
      const result = await this.agentService.execute(
        instruction,
        dto.message,
        sid,
        userId,
        dto.modelId,
      );
      return {
        agentDna: instruction,
        reply: result.reply,
        toolCalls: result.toolCalls,
        totalSteps: result.totalSteps,
        sessionId: result.sessionId,
      };
    } catch (error: any) {
      throw this.mapAgentError(error);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('session/:sessionId')
  clearSession(@Param('sessionId') sessionId: string, @Req() req: any) {
    const userId: string = req.user.sub;
    this.agentService.clearSession(sessionId, userId);
    return { message: `Session ${sessionId} cleared.` };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('interact/stream')
  async interactStream(
    @Body() dto: InteractDto,
    @Req() req: Request & { user: any },
    @Res() res: Response,
  ) {
    const userId: string = req.user.sub;
    const instruction = dto.dna || DEFAULT_AGENT_DNA;
    const sid = dto.sessionId || randomUUID();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const stream = this.agentService.executeStream(
      instruction,
      dto.message,
      sid,
      userId,
      dto.modelId,
    );

    const subscription = stream.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      complete: () => {
        res.end();
      },
      error: (err) => {
        res.write(
          `data: ${JSON.stringify({ type: 'error', code: 'STREAM_ERROR', message: err.message })}\n\n`,
        );
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  private mapAgentError(error: Error): HttpException {
    const msg = error.message || 'Unknown error';
    if (msg.startsWith('LLM_AUTH_ERROR')) {
      return new HttpException({ error: msg, code: 'LLM_AUTH_ERROR' }, HttpStatus.UNAUTHORIZED);
    }
    if (msg.startsWith('LLM_TIMEOUT')) {
      return new HttpException({ error: msg, code: 'LLM_TIMEOUT' }, HttpStatus.GATEWAY_TIMEOUT);
    }
    if (msg.startsWith('SESSION_LIMIT')) {
      return new HttpException({ error: msg, code: 'SESSION_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return new HttpException({ error: msg, code: 'AGENT_ERROR' }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}