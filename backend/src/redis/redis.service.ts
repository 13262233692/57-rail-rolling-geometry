import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { LaserProfileData, REDIS_KEYS } from '../common/types';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);
  private batchBuffer: LaserProfileData[] = [];
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 50;
  private flushTimer: NodeJS.Timeout | null = null;
  private redisAvailable: boolean = false;
  private lastErrorLog: number = 0;
  private readonly ERROR_LOG_INTERVAL = 30000;

  private memoryCache: Map<number, LaserProfileData> = new Map();
  private memoryHistory: Map<number, LaserProfileData[]> = new Map();
  private totalFrameCount: number = 0;
  private readonly MAX_HISTORY_PER_SENSOR = 100;

  async onModuleInit() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const useRedis = process.env.DISABLE_REDIS !== 'true';

    if (useRedis) {
      try {
        this.client = new Redis({
          host,
          port,
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
          lazyConnect: true,
          commandTimeout: 1000,
        });

        this.client.on('connect', () => {
          this.redisAvailable = true;
          this.logger.log(`Redis connected: ${host}:${port}`);
        });

        this.client.on('error', (err) => {
          if (this.redisAvailable) {
            this.redisAvailable = false;
            this.logger.warn(`Redis disconnected: ${err.message}`);
          } else {
            const now = Date.now();
            if (now - this.lastErrorLog > this.ERROR_LOG_INTERVAL) {
              this.logger.warn(`Redis unavailable: ${err.message}`);
              this.lastErrorLog = now;
            }
          }
        });

        this.client.connect().catch(() => {
          this.logger.warn('Redis connection failed, using memory cache only');
        });
      } catch (err) {
        this.logger.warn('Redis initialization failed, using memory cache only');
      }
    } else {
      this.logger.log('Redis disabled, using memory cache only');
    }

    this.startBatchFlush();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  private startBatchFlush() {
    this.flushTimer = setInterval(() => {
      this.flushBatch();
    }, this.FLUSH_INTERVAL);
  }

  private async flushBatch() {
    if (this.batchBuffer.length === 0) return;

    const batch = this.batchBuffer.splice(0, this.batchBuffer.length);

    for (const data of batch) {
      this.memoryCache.set(data.sensorId, data);

      let history = this.memoryHistory.get(data.sensorId);
      if (!history) {
        history = [];
        this.memoryHistory.set(data.sensorId, history);
      }
      history.push(data);
      if (history.length > this.MAX_HISTORY_PER_SENSOR) {
        history.shift();
      }
    }

    this.totalFrameCount += batch.length;

    if (this.redisAvailable && this.client) {
      try {
        const pipeline = this.client.pipeline();

        for (const data of batch) {
          const key = `${REDIS_KEYS.LATEST_PROFILE}:${data.sensorId}`;
          pipeline.set(key, JSON.stringify(data));
          pipeline.zadd(
            `${REDIS_KEYS.PROFILE_HISTORY}:${data.sensorId}`,
            Date.now(),
            JSON.stringify(data),
          );
        }

        pipeline.incrby(REDIS_KEYS.FRAME_COUNT, batch.length);
        await pipeline.exec();
      } catch {
        // Redis write failed, data already in memory cache
      }
    }
  }

  async cacheProfile(data: LaserProfileData): Promise<void> {
    this.batchBuffer.push(data);

    if (this.batchBuffer.length >= this.BATCH_SIZE) {
      this.flushBatch();
    }
  }

  async getLatestProfile(sensorId: number): Promise<LaserProfileData | null> {
    const memoryData = this.memoryCache.get(sensorId);
    if (memoryData) return memoryData;

    if (this.redisAvailable && this.client) {
      try {
        const key = `${REDIS_KEYS.LATEST_PROFILE}:${sensorId}`;
        const data = await this.client.get(key);
        if (data) {
          const parsed = JSON.parse(data) as LaserProfileData;
          this.memoryCache.set(sensorId, parsed);
          return parsed;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  async getAllLatestProfiles(): Promise<Map<number, LaserProfileData>> {
    const result = new Map<number, LaserProfileData>();

    for (const [id, profile] of this.memoryCache) {
      result.set(id, profile);
    }

    if (result.size > 0) return result;

    if (this.redisAvailable && this.client) {
      try {
        for (let i = 1; i <= 4; i++) {
          const profile = await this.getLatestProfile(i);
          if (profile) {
            result.set(i, profile);
          }
        }
      } catch {
        // ignore
      }
    }

    return result;
  }

  async updateSensorStatus(sensorId: number, status: object) {
    if (this.redisAvailable && this.client) {
      try {
        await this.client.hset(
          REDIS_KEYS.SENSOR_STATUS,
          String(sensorId),
          JSON.stringify(status),
        );
      } catch {
        // ignore
      }
    }
  }

  isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  getTotalFrameCount(): number {
    return this.totalFrameCount;
  }

  getClient(): Redis | null {
    return this.client;
  }
}
