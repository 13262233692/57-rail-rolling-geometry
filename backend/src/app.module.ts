import { Module } from '@nestjs/common';
import { TcpGatewayModule } from './tcp-gateway/tcp-gateway.module';
import { RedisModule } from './redis/redis.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ProfileModule } from './profile/profile.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [WorkersModule, TcpGatewayModule, RedisModule, WebsocketModule, ProfileModule],
})
export class AppModule {}
