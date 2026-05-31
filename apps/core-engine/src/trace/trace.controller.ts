import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { TraceService } from './trace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('traces')
@UseGuards(JwtAuthGuard)
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  @Get()
  list(@Req() req: any, @Query('sessionId') sessionId?: string) {
    const userId: string = req.user.sub;
    return this.traceService.listTraces(userId, sessionId);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user.sub;
    const trace = this.traceService.getTrace(id, userId);
    if (!trace) {
      throw new NotFoundException(`Trace ${id} not found`);
    }
    return trace;
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user.sub;
    const deleted = this.traceService.deleteTrace(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Trace ${id} not found`);
    }
    return { message: `Trace ${id} deleted.` };
  }
}
