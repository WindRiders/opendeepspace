import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { TemplateService } from './template.service';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  getAll() {
    return this.templateService.getAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    const template = this.templateService.getById(id);
    if (!template) {
      throw new NotFoundException(`Template "${id}" not found`);
    }
    return template;
  }
}
