import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'profile',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server: Server;

  private clientCount: number = 0;

  constructor(private readonly redisService: RedisService) {}

  handleConnection(client: Socket) {
    this.clientCount++;
    this.logger.log(
      `Client connected: ${client.id}, total: ${this.clientCount}`,
    );

    this.redisService
      .getAllLatestProfiles()
      .then((profiles) => {
        const data: { [key: number]: object } = {};
        profiles.forEach((profile, id) => {
          data[id] = profile;
        });
        client.emit('init', {
          profiles: data,
          timestamp: Date.now(),
        });
      })
      .catch(() => {});
  }

  handleDisconnect(client: Socket) {
    this.clientCount--;
    this.logger.log(
      `Client disconnected: ${client.id}, total: ${this.clientCount}`,
    );
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket, payload: any) {
    return { event: 'pong', data: { timestamp: Date.now(), payload } };
  }

  broadcastProfile(profile: any) {
    this.server.emit('profile', {
      ...profile,
      serverTime: Date.now(),
    });
  }

  broadcastFullFrame(frameData: {
    timestamp: number;
    profiles: { [key: number]: object };
    mergedPoints: object[];
    stats: object;
  }) {
    this.server.emit('fullFrame', frameData);
  }

  getClientCount(): number {
    return this.clientCount;
  }
}
