import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { TcpGatewayModule } from '../tcp-gateway/tcp-gateway.module';

@Module({
  imports: [WebsocketModule, TcpGatewayModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
