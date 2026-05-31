/**
 * gRPC Client Module — provides GrpcClientService globally.
 */

import { Global, Module } from '@nestjs/common';
import { GrpcClientService } from './grpc-client.service';

@Global()
@Module({
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcModule {}