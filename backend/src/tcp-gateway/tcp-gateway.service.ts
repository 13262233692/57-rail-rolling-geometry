import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as net from 'net';
import { RedisService } from '../redis/redis.service';
import {
  LaserProfileData,
  ProfilePoint,
  PROTOCOL,
  SENSOR_CONFIGS,
} from '../common/types';

interface SocketSession {
  socket: net.Socket;
  sensorId: number;
  buffer: Buffer;
  frameCount: number;
  lastFrameTime: number;
}

@Injectable()
export class TcpGatewayService implements OnModuleInit {
  private readonly logger = new Logger(TcpGatewayService.name);
  private servers: Map<number, net.Server> = new Map();
  private sessions: Map<number, SocketSession> = new Map();
  private totalFrames: number = 0;
  private fpsStartTime: number = 0;
  private fpsFrameCount: number = 0;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    this.startTcpServers();
    setInterval(() => this.logStats(), 5000);
    this.fpsStartTime = Date.now();
  }

  private startTcpServers() {
    for (const config of SENSOR_CONFIGS) {
      const server = net.createServer();
      server.listen(config.tcpPort, '0.0.0.0', () => {
        this.logger.log(
          `TCP server for sensor ${config.id} listening on port ${config.tcpPort}`,
        );
      });

      server.on('connection', (socket) => {
        this.handleConnection(socket, config.id);
      });

      server.on('error', (err) => {
        this.logger.error(
          `TCP server error for sensor ${config.id}: ${err.message}`,
        );
      });

      this.servers.set(config.id, server);
    }
  }

  private handleConnection(socket: net.Socket, sensorId: number) {
    const session: SocketSession = {
      socket,
      sensorId,
      buffer: Buffer.alloc(0),
      frameCount: 0,
      lastFrameTime: Date.now(),
    };

    this.sessions.set(sensorId, session);
    this.logger.log(
      `Sensor ${sensorId} connected from ${socket.remoteAddress}:${socket.remotePort}`,
    );

    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10000);

    socket.on('data', (data) => {
      this.handleData(session, data);
    });

    socket.on('close', () => {
      this.logger.log(`Sensor ${sensorId} disconnected`);
      this.sessions.delete(sensorId);
    });

    socket.on('error', (err) => {
      this.logger.warn(`Sensor ${sensorId} error: ${err.message}`);
    });
  }

  private handleData(session: SocketSession, data: Buffer) {
    session.buffer = Buffer.concat([session.buffer, data]);
    session.lastFrameTime = Date.now();

    while (session.buffer.length >= PROTOCOL.HEADER_SIZE) {
      const magic = session.buffer.readUInt32LE(0);
      if (magic !== PROTOCOL.MAGIC_NUMBER) {
        const idx = this.findMagicNumber(session.buffer);
        if (idx === -1) {
          session.buffer = Buffer.alloc(0);
          return;
        }
        session.buffer = session.buffer.slice(idx);
        continue;
      }

      const totalLen = session.buffer.readUInt32LE(4);
      if (session.buffer.length < totalLen) {
        break;
      }

      const frameData = session.buffer.slice(0, totalLen);
      session.buffer = session.buffer.slice(totalLen);

      try {
        const profile = this.parseFrame(frameData, session.sensorId);
        this.processProfile(profile, session);
      } catch (err) {
        this.logger.warn(
          `Parse error for sensor ${session.sensorId}: ${err.message}`,
        );
      }
    }
  }

  private findMagicNumber(buf: Buffer): number {
    for (let i = 0; i <= buf.length - 4; i++) {
      if (buf.readUInt32LE(i) === PROTOCOL.MAGIC_NUMBER) {
        return i;
      }
    }
    return -1;
  }

  private parseFrame(data: Buffer, sensorId: number): LaserProfileData {
    const timestampHigh = data.readUInt32LE(8);
    const timestampLow = data.readUInt32LE(12);
    const timestampBig = BigInt(timestampHigh) * BigInt(0x100000000) + BigInt(timestampLow);
    const timestamp = timestampBig.toString();

    const frameId = data.readUInt32LE(16);
    const pointCount = data.readUInt16LE(20);

    const points: ProfilePoint[] = new Array(pointCount);
    let offset = PROTOCOL.HEADER_SIZE + 8;

    for (let i = 0; i < pointCount; i++) {
      const x = data.readFloatLE(offset);
      const y = data.readFloatLE(offset + 4);
      const z = data.readFloatLE(offset + 8);
      const intensity = data.readUInt16LE(offset + 12);

      points[i] = { x, y, z, intensity };
      offset += PROTOCOL.POINT_SIZE;
    }

    return {
      timestamp,
      sensorId,
      frameId,
      points,
    };
  }

  private processProfile(profile: LaserProfileData, session: SocketSession) {
    session.frameCount++;
    this.totalFrames++;
    this.fpsFrameCount++;

    this.redisService.cacheProfile(profile);
    this.broadcastProfile(profile);
  }

  private broadcastProfile(profile: LaserProfileData) {
    // Will be connected to WebSocket gateway
  }

  private logStats() {
    const now = Date.now();
    const elapsed = (now - this.fpsStartTime) / 1000;
    const fps = Math.round(this.fpsFrameCount / elapsed);

    this.logger.log(
      `[Stats] Total frames: ${this.totalFrames}, FPS: ${fps}, Active sensors: ${this.sessions.size}`,
    );

    for (const [id, session] of this.sessions) {
      this.logger.log(
        `  Sensor ${id}: ${session.frameCount} frames, buffer: ${session.buffer.length} bytes`,
      );
    }

    this.fpsFrameCount = 0;
    this.fpsStartTime = now;

    for (const session of this.sessions.values()) {
      session.frameCount = 0;
    }
  }

  getActiveSensors(): number[] {
    return Array.from(this.sessions.keys());
  }

  getSession(sensorId: number): SocketSession | undefined {
    return this.sessions.get(sensorId);
  }
}
