import { Module } from '@nestjs/common';
import { TraceService } from './trace.service';
import { TraceController } from './trace.controller';

@Module({
  providers: [TraceService],
  controllers: [TraceController],
  exports: [TraceService],
})
export class TraceModule {}
