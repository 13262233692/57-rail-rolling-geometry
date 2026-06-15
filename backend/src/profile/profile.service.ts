import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { TcpGatewayService } from '../tcp-gateway/tcp-gateway.service';
import { ProfileAnalysisService } from '../workers/profile-analysis.service';
import {
  LaserProfileData,
  MILL_COUNT,
} from '../common/types';

interface AnalysisResultCache {
  millId: number;
  mergedPoints: any[];
  stats: any;
  deviation: any;
  regression: any;
  timestamp: number;
  processingTime: number;
}

@Injectable()
export class ProfileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileService.name);
  private latestProfiles: Map<number, LaserProfileData> = new Map();
  private analysisResults: Map<number, AnalysisResultCache> = new Map();
  private frameCount: number = 0;
  private readonly PUSH_INTERVAL = 50;
  private pushTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private lastEventLoopPing: number = Date.now();
  private eventLoopLag: number = 0;
  private processingQueue: Set<number> = new Set();

  constructor(
    private readonly redisService: RedisService,
    private readonly wsGateway: WebsocketGateway,
    private readonly tcpGateway: TcpGatewayService,
    private readonly analysisService: ProfileAnalysisService,
  ) {}

  async onModuleInit() {
    this.logger.log('ProfileService initializing with Worker Pool architecture');
    this.startEventLoopMonitor();
    this.startPushLoop();
  }

  onModuleDestroy() {
    if (this.pushTimer) clearInterval(this.pushTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
  }

  private startEventLoopMonitor() {
    const CHECK_INTERVAL = 1000;

    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();
      this.eventLoopLag = now - this.lastEventLoopPing - CHECK_INTERVAL;
      this.lastEventLoopPing = now;

      if (this.eventLoopLag > 100) {
        this.logger.warn(
          `[EventLoop] Lag detected: ${Math.round(this.eventLoopLag)}ms - ` +
          `Queue size: ${this.processingQueue.size}`,
        );
      }
    }, CHECK_INTERVAL);

    setInterval(() => {
      this.logger.log(
        `[EventLoop] lag=${Math.round(this.eventLoopLag)}ms ` +
        `processing=${this.processingQueue.size} ` +
        `workers=${this.analysisService.getWorkerStats().activeWorkers}`,
      );
    }, 10000);
  }

  private startPushLoop() {
    this.pushTimer = setInterval(() => {
      this.processAndPush();
    }, this.PUSH_INTERVAL);
  }

  private async processAndPush() {
    const profiles = await this.redisService.getAllLatestProfiles();
    if (profiles.size === 0) return;

    profiles.forEach((profile, id) => {
      this.latestProfiles.set(id, profile);
    });

    const millId = 1;
    if (!this.processingQueue.has(millId)) {
      this.processingQueue.add(millId);

      const sectionId = `SEC_${Date.now()}_${this.frameCount}`;

      this.analysisService
        .analyzeMillProfile(
          millId,
          {
            profiles: Object.fromEntries(profiles),
            sectionId,
          },
          10,
        )
        .then((result) => {
          this.handleAnalysisComplete(millId, profiles, result);
        })
        .catch((error) => {
          this.logger.error(`Mill ${millId} analysis failed: ${error.message}`);
          this.processingQueue.delete(millId);
        });
    }

    this.pushLightweightFrame(profiles);
  }

  private handleAnalysisComplete(
    millId: number,
    profiles: Map<number, LaserProfileData>,
    analysisResult: any,
  ) {
    this.processingQueue.delete(millId);
    this.frameCount++;

    const stats = this.calculateLightweightStats(profiles, analysisResult.mergedProfile);

    const cachedResult: AnalysisResultCache = {
      millId,
      mergedPoints: analysisResult.mergedProfile,
      stats,
      deviation: analysisResult.deviation,
      regression: analysisResult.regression,
      timestamp: Date.now(),
      processingTime: analysisResult.processingTime,
    };

    this.analysisResults.set(millId, cachedResult);

    const fullFrameData = {
      timestamp: Date.now(),
      frameId: this.frameCount,
      millId,
      profiles: Object.fromEntries(profiles),
      mergedPoints: analysisResult.mergedProfile,
      stats: {
        ...stats,
        analysisTime: analysisResult.processingTime,
        eventLoopLag: this.eventLoopLag,
      },
      deviation: analysisResult.deviation,
      regression: analysisResult.regression,
    };

    this.wsGateway.broadcastFullFrame(fullFrameData);

    this.processOtherMills(millId, profiles);
  }

  private async processOtherMills(
    currentMillId: number,
    currentProfiles: Map<number, LaserProfileData>,
  ) {
    const millPromises: Promise<void>[] = [];

    for (let millId = 2; millId <= MILL_COUNT; millId++) {
      if (this.processingQueue.has(millId)) continue;

      this.processingQueue.add(millId);

      const offsetX = (millId - 2.5) * 300;
      const simulatedProfiles = this.simulateMillProfiles(currentProfiles, offsetX);
      const sectionId = `SEC_${Date.now()}_${millId}_${this.frameCount}`;

      const promise = this.analysisService
        .analyzeMillProfile(
          millId,
          {
            profiles: Object.fromEntries(simulatedProfiles),
            sectionId,
          },
          5,
        )
        .then((result) => {
          this.processingQueue.delete(millId);

          const stats = this.calculateLightweightStats(simulatedProfiles, result.mergedProfile);

          const cachedResult: AnalysisResultCache = {
            millId,
            mergedPoints: result.mergedProfile,
            stats,
            deviation: result.deviation,
            regression: result.regression,
            timestamp: Date.now(),
            processingTime: result.processingTime,
          };

          this.analysisResults.set(millId, cachedResult);
        })
        .catch((error) => {
          this.logger.error(`Mill ${millId} analysis failed: ${error.message}`);
          this.processingQueue.delete(millId);
        });

      millPromises.push(promise);
    }

    await Promise.allSettled(millPromises);
  }

  private simulateMillProfiles(
    sourceProfiles: Map<number, LaserProfileData>,
    offsetX: number,
  ): Map<number, LaserProfileData> {
    const result = new Map<number, LaserProfileData>();
    const wearFactor = 0.95 + Math.random() * 0.1;

    for (const [id, profile] of sourceProfiles) {
      const modifiedPoints = profile.points.map((p) => ({
        x: p.x + offsetX * 0.05,
        y: p.y * wearFactor,
        z: p.z,
        intensity: Math.max(100, p.intensity - Math.random() * 50),
      }));

      result.set(id, {
        ...profile,
        timestamp: profile.timestamp,
        points: modifiedPoints,
      });
    }

    return result;
  }

  private pushLightweightFrame(profiles: Map<number, LaserProfileData>) {
    const points: any[] = [];
    for (const p of this.lightweightMerge(profiles)) {
      points.push({ x: p.x, y: p.y, i: p.intensity, s: p.sensorId });
    }

    this.wsGateway.broadcastProfile({
      timestamp: Date.now(),
      quickPreview: true,
      points,
      pointCount: points.length,
    });
  }

  private lightweightMerge(profiles: Map<number, LaserProfileData>) {
    const result: Array<{ x: number; y: number; intensity: number; sensorId: number }> = [];
    const configs = [
      { id: 1, angle: 0, distance: 150 },
      { id: 2, angle: 90, distance: 150 },
      { id: 3, angle: 180, distance: 150 },
      { id: 4, angle: 270, distance: 150 },
    ];

    for (const [sensorId, profile] of profiles) {
      const config = configs.find((c) => c.id === sensorId);
      if (!config) continue;

      const angleRad = (config.angle * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const offsetX = -config.distance * sinA;
      const offsetY = config.distance * cosA;

      const step = Math.max(1, Math.floor(profile.points.length / 50));

      for (let i = 0; i < profile.points.length; i += step) {
        const p = profile.points[i];
        result.push({
          x: p.x * cosA - p.y * sinA + offsetX,
          y: p.x * sinA + p.y * cosA + offsetY,
          intensity: p.intensity,
          sensorId,
        });
      }
    }

    return result;
  }

  private calculateLightweightStats(
    profiles: Map<number, LaserProfileData>,
    mergedPoints: any[],
  ) {
    const pointCount = mergedPoints.length;
    const sensorCount = profiles.size;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let totalIntensity = 0;

    const step = Math.max(1, Math.floor(mergedPoints.length / 200));
    let count = 0;

    for (let i = 0; i < mergedPoints.length; i += step) {
      const p = mergedPoints[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      totalIntensity += p.intensity;
      count++;
    }

    const avgIntensity = count > 0 ? totalIntensity / count : 0;
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

  getAnalysisResult(millId: number): AnalysisResultCache | undefined {
    return this.analysisResults.get(millId);
  }

  getAllAnalysisResults(): Map<number, AnalysisResultCache> {
    return new Map(this.analysisResults);
  }

  getEventLoopLag(): number {
    return this.eventLoopLag;
  }

  getWorkerStats() {
    return this.analysisService.getWorkerStats();
  }
}

export { MILL_COUNT };
