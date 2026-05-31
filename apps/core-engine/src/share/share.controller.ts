import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ShareService } from './share.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateShareDto } from './dto/create-share.dto';

@Controller('shares')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  // Public: anyone with the link can view
  @Get(':id')
  getShare(@Param('id') id: string) {
    const share = this.shareService.getShare(id);
    if (!share) throw new NotFoundException(`Share ${id} not found`);
    return share;
  }

  // Protected: list own shares
  @Get()
  @UseGuards(JwtAuthGuard)
  listShares(@Req() req: any) {
    const userId: string = req.user.sub;
    return this.shareService.listShares(userId);
  }

  // Protected: create a share
  @Post()
  @UseGuards(JwtAuthGuard)
  createShare(@Body() dto: CreateShareDto, @Req() req: any) {
    const userId: string = req.user.sub;
    return this.shareService.createShare(
      dto.type,
      dto.title,
      dto.payload,
      userId,
    );
  }

  // Protected: delete own share
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteShare(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user.sub;
    const deleted = this.shareService.deleteShare(id, userId);
    if (!deleted) throw new NotFoundException(`Share ${id} not found`);
    return { message: `Share ${id} deleted.` };
  }
}
