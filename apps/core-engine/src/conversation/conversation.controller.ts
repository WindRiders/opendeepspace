import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateTitleDto } from './dto/update-title.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  list(@Req() req: any) {
    const userId: string = req.user.sub;
    return this.sessionService.listConversations(userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user.sub;
    this.sessionService.deleteSession(id, userId);
    return { message: `Conversation ${id} deleted.` };
  }

  @Patch(':id/title')
  updateTitle(
    @Param('id') id: string,
    @Body() dto: UpdateTitleDto,
    @Req() req: any,
  ) {
    const userId: string = req.user.sub;
    const updated = this.sessionService.updateConversationTitle(
      id,
      userId,
      dto.title,
    );
    if (!updated) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }
    return { message: 'Title updated.', title: dto.title };
  }
}
