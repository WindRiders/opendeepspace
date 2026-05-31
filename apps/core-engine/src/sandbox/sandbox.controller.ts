import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sandbox')
@UseGuards(JwtAuthGuard)
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('files')
  async listFiles(@Query('path') dirPath?: string) {
    return this.sandboxService.listFiles(dirPath || '');
  }

  @Get('read')
  async readFile(@Query('path') filePath: string) {
    if (!filePath) {
      throw new BadRequestException('path query parameter is required');
    }
    try {
      return await this.sandboxService.readFile(filePath);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
