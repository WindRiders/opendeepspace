import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Request,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsArray, IsIn, IsDefined, MaxLength } from 'class-validator';
import { Observable } from 'rxjs';
import { OrchestratorService } from './orchestrator.service';
import type { AgentRole, CollabSSEEvent } from '@deepspace/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateCollabDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  task: string;

  @IsDefined()
  @IsArray()
  @IsString({ each: true })
  agents: AgentRole[];
}

class AddMessageDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsDefined()
  @IsString()
  @IsIn(['task', 'response', 'handoff', 'summary'])
  type: 'task' | 'response' | 'handoff' | 'summary';
}

@Controller('collab')
@UseGuards(JwtAuthGuard)
export class CollabController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Get('roles')
  getRoles() {
    return this.orchestrator.getAvailableRoles();
  }

  @Get('sessions')
  listSessions(@Request() req: any) {
    return this.orchestrator.listSessions(req.user.sub);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string, @Request() req: any) {
    const session = this.orchestrator.getSession(id, req.user.sub);
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  @Post('sessions')
  createSession(@Body() dto: CreateCollabDto, @Request() req: any) {
    return this.orchestrator.planExecution(dto.task, dto.agents, req.user.sub);
  }

  @Post('sessions/:id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
    @Request() req: any,
  ) {
    const msg = this.orchestrator.addMessage(
      id,
      req.user.sub,
      dto.from as any,
      dto.to as any,
      dto.content,
      dto.type,
    );
    if (!msg) throw new NotFoundException(`Session ${id} not found`);
    return msg;
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string, @Request() req: any) {
    const deleted = this.orchestrator.deleteSession(id, req.user.sub);
    if (!deleted) throw new NotFoundException(`Session ${id} not found`);
    return { message: `Session ${id} deleted.` };
  }

  @Get('sessions/:id/stream')
  executeStream(
    @Param('id') id: string,
    @Query('modelId') modelId: string | undefined,
    @Request() req: any,
  ): Observable<CollabSSEEvent> {
    return new Observable<CollabSSEEvent>((subscriber) => {
      (async () => {
        try {
          for await (const event of this.orchestrator.runSessionStream(
            id, req.user.sub, modelId,
          )) {
            subscriber.next(event);
            if (event.type === 'collab_done' || event.type === 'collab_error') {
              subscriber.complete();
              return;
            }
          }
          subscriber.complete();
        } catch (err: any) {
          subscriber.next({
            type: 'collab_error',
            sessionId: id,
            message: err.message,
          });
          subscriber.complete();
        }
      })();
    });
  }
}
