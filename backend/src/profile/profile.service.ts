import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { TcpGatewayService } from '../tcp-gateway/tcp-gateway.service';
import {
  LaserProfileData,
  ProfilePoint,
  SENSOR_CONFIGS,
} from '../common/types';

interface MergedPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
  sensorId: number;
  angle: number;
}

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly logger = new Logger(ProfileService.name);
  private latestProfiles: Map<number, LaserProfileData> = new Map();
  private frameCount: number = 0;
  private readonly PUSH_INTERVAL = 50;

  constructor(
    private readonly redisService: RedisService,
    private readonly wsGateway: WebsocketGateway,
    private readonly tcpGateway: TcpGatewayService,
  ) {}

  async onModuleInit() {
    this.startMergeLoop();
  }

  private startMergeLoop() {
    setInterval(async () => {
      await this.processAndPush();
    }, this.PUSH_INTERVAL);
  }

  private async processAndPush() {
    const profiles = await this.redisService.getAllLatestProfiles();
    if (profiles.size === 0) return;

    profiles.forEach((profile, id) => {
      this.latestProfiles.set(id, profile);
    });

    const mergedPoints = this.mergeProfiles(profiles);
    const stats = this.calculateStats(profiles, mergedPoints);

    const frameData = {
      timestamp: Date.now(),
      frameId: ++this.frameCount,
      profiles: Object.fromEntries(profiles),
      mergedPoints,
      stats,
    };

    this.wsGateway.broadcastFullFrame(frameData);
  }

  private mergeProfiles(
    profiles: Map<number, LaserProfileData>,
  ): MergedPoint[] {
    const merged: MergedPoint[] = [];

    for (const [sensorId, profile] of profiles) {
      const config = SENSOR_CONFIGS.find((c) => c.id === sensorId);
      if (!config) continue;

      const angleRad = (config.angle * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);

      for (const point of profile.points) {
        const rotatedX = point.x * cosA - point.y * sinA;
        const rotatedY = point.x * sinA + point.y * cosA;

        const offsetX = -config.distance * sinA;
        const offsetY = config.distance * cosA;

        merged.push({
          x: rotatedX + offsetX,
          y: rotatedY + offsetY,
          z: point.z,
          intensity: point.intensity,
          sensorId,
          angle: config.angle,
        });
      }
    }

    merged.sort((a, b) => {
      const angleA = Math.atan2(a.y, a.x);
      const angleB = Math.atan2(b.y, b.x);
      return angleA - angleB;
    });

    return merged;
  }

  private calculateStats(
    profiles: Map<number, LaserProfileData>,
    mergedPoints: MergedPoint[],
  ) {
    const pointCount = mergedPoints.length;
    const sensorCount = profiles.size;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let totalIntensity = 0;

    for (const p of mergedPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      totalIntensity += p.intensity;
    }

    const avgIntensity = pointCount > 0 ? totalIntensity / pointCount : 0;
    const width = maxX - minX;
    const height = maxY - minY;

    return {
      pointCount,
      sensorCount,
      frameId: this.frameCount,
      bounds: { minX, maxX, minY, maxY, width, height },
      avgIntensity,
      fps: Math.round(1000 / this.PUSH_INTERVAL),
    };
  }

  getLatestProfiles(): Map<number, LaserProfileData> {
    return this.latestProfiles;
  }

  getFrameCount(): number {
    return this.frameCount;
  }
}
