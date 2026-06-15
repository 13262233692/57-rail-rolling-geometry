import { Module } from '@nestjs/common';
import { TcpGatewayService } from './tcp-gateway.service';

@Module({
  providers: [TcpGatewayService],
  exports: [TcpGatewayService],
})
export class TcpGatewayModule {}
