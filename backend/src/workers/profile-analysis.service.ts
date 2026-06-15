import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import {
  WorkerTaskType,
  ProfileDeviationPayload,
  DeviationResult,
  RegressionPayload,
  RegressionResult,
  MILL_COUNT,
  MillAnalysisResult,
  MillState,
} from './types';
import { SENSOR_CONFIGS } from '../common/types';
import { generateUIC60Outline } from '../common/uic60';

@Injectable()
export class ProfileAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(ProfileAnalysisService.name);
  private millStates: Map<number, MillState> = new Map();
  private standardProfile: Array<{ x: number; y: number }> = [];
  private analysisCache: Map<string, MillAnalysisResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private readonly workerPool: WorkerPoolService) {
    for (let i = 1; i <= MILL_COUNT; i++) {
      this.millStates.set(i, {
        millId: i,
        latestData: null,
        latestResult: null,
        pendingTaskCount: 0,
        totalProcessed: 0,
        avgProcessingTime: 0,
      });
    }
  }

  async onModuleInit() {
    this.standardProfile = generateUIC60Outline();
    this.logger.log(
      `ProfileAnalysisService initialized for ${MILL_COUNT} mills, standard profile: ${this.standardProfile.length} points`,
    );

    setInterval(() => this.logAnalysisStats(), 10000);
  }

  async analyzeMillProfile(
    millId: number,
    profileData: any,
    priority: number = 5,
  ): Promise<MillAnalysisResult> {
    const state = this.millStates.get(millId);
    if (!state) {
      throw new Error(`Invalid mill ID: ${millId}`);
    }

    state.latestData = profileData;
    state.pendingTaskCount++;

    const startTime = Date.now();
    const result: MillAnalysisResult = {
      millId,
      timestamp: startTime,
      deviation: null,
      regression: null,
      mergedProfile: null,
      status: 'processing',
      processingTime: 0,
    };

    try {
      const mergedPoints = await this.executeProfileMerge(millId, profileData, priority + 1);
      result.mergedProfile = mergedPoints;

      const [deviationResult, regressionResult] = await Promise.all([
        this.executeDeviationAnalysis(millId, profileData.sectionId, mergedPoints, priority),
        this.executeRegressionAnalysis(millId, mergedPoints, priority - 1),
      ]);

      result.deviation = deviationResult;
      result.regression = regressionResult;
      result.status = 'completed';
      result.processingTime = Date.now() - startTime;

      state.latestResult = result;
      state.pendingTaskCount--;
      state.totalProcessed++;
      state.avgProcessingTime =
        (state.avgProcessingTime * (state.totalProcessed - 1) + result.processingTime) /
        state.totalProcessed;

      this.cacheResult(`${millId}_${startTime}`, result);

      return result;
    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : String(error);
      result.processingTime = Date.now() - startTime;
      state.pendingTaskCount--;

      this.logger.error(
        `Mill ${millId} analysis failed: ${result.error}, duration: ${result.processingTime}ms`,
      );

      return result;
    }
  }

  private async executeProfileMerge(
    millId: number,
    profileData: any,
    priority: number,
  ): Promise<any[]> {
    const result = await this.workerPool.submitTask({
      type: WorkerTaskType.PROFILE_MERGE,
      payload: {
        profiles: profileData.profiles,
        sensorConfigs: SENSOR_CONFIGS,
        millId,
      },
      priority,
      timeout: 2000,
    });

    return result.data;
  }

  private async executeDeviationAnalysis(
    millId: number,
    sectionId: string,
    mergedPoints: any[],
    priority: number,
  ): Promise<DeviationResult> {
    const measuredPoints = mergedPoints.map((p) => ({
      x: p.x,
      y: p.y,
      intensity: p.intensity,
    }));

    const payload: ProfileDeviationPayload = {
      measuredPoints,
      standardProfile: this.standardProfile,
      millId,
      sectionId: sectionId || `${Date.now()}`,
    };

    const result = await this.workerPool.submitTask({
      type: WorkerTaskType.DEVIATION_CALCULATION,
      payload,
      priority,
      timeout: 3000,
    });

    return result.data as DeviationResult;
  }

  private async executeRegressionAnalysis(
    millId: number,
    mergedPoints: any[],
    priority: number,
  ): Promise<RegressionResult> {
    const sorted = [...mergedPoints].sort((a, b) => a.x - b.x);

    const step = Math.max(1, Math.floor(sorted.length / 200));
    const xData: number[] = [];
    const yData: number[] = [];

    for (let i = 0; i < sorted.length; i += step) {
      xData.push(sorted[i].x);
      yData.push(sorted[i].y);
    }

    const payload: RegressionPayload = {
      xData,
      yData,
      order: 6,
      tolerance: 1e-8,
    };

    const result = await this.workerPool.submitTask({
      type: WorkerTaskType.NONLINEAR_REGRESSION,
      payload,
      priority,
      timeout: 2000,
    });

    return result.data as RegressionResult;
  }

  async analyzeAllMills(
    millDataArray: Array<{ millId: number; data: any }>,
  ): Promise<Map<number, MillAnalysisResult>> {
    const results = new Map<number, MillAnalysisResult>();

    const promises = millDataArray.map(({ millId, data }) =>
      this.analyzeMillProfile(millId, data, 10 - millId).then((result) => {
        results.set(millId, result);
        return result;
      }),
    );

    await Promise.all(promises);
    return results;
  }

  getMillState(millId: number): MillState | undefined {
    return this.millStates.get(millId);
  }

  getAllMillStates(): Map<number, MillState> {
    return new Map(this.millStates);
  }

  getLatestResult(millId: number): MillAnalysisResult | null {
    return this.millStates.get(millId)?.latestResult || null;
  }

  getAllLatestResults(): Map<number, MillAnalysisResult> {
    const results = new Map<number, MillAnalysisResult>();
    for (const [id, state] of this.millStates) {
      if (state.latestResult) {
        results.set(id, state.latestResult);
      }
    }
    return results;
  }

  getWorkerStats() {
    return this.workerPool.getStats();
  }

  private cacheResult(key: string, result: MillAnalysisResult) {
    this.analysisCache.set(key, result);
    if (this.analysisCache.size > this.MAX_CACHE_SIZE) {
      const keys = this.analysisCache.keys();
      const firstKey = keys.next().value;
      if (firstKey) {
        this.analysisCache.delete(firstKey);
      }
    }
  }

  private logAnalysisStats() {
    let totalPending = 0;
    let totalProcessed = 0;

    for (const [id, state] of this.millStates) {
      totalPending += state.pendingTaskCount;
      totalProcessed += state.totalProcessed;

      this.logger.log(
        `[Mill ${id}] pending=${state.pendingTaskCount} ` +
          `processed=${state.totalProcessed} ` +
          `avgTime=${Math.round(state.avgProcessingTime)}ms`,
      );
    }

    const poolStats = this.workerPool.getStats();
    this.logger.log(
      `[Analysis] totalPending=${totalPending} totalProcessed=${totalProcessed} ` +
        `workers=${poolStats.activeWorkers} busy=${poolStats.busyWorkers} ` +
        `queue=${poolStats.queueSize} avgDuration=${poolStats.avgDuration}ms`,
    );
  }

  async runBilinearInterpolationTest(size: number = 500): Promise<number> {
    const matrix: number[][] = [];
    for (let y = 0; y < size; y++) {
      const row: number[] = [];
      for (let x = 0; x < size; x++) {
        row.push(Math.sin(x * 0.01) * Math.cos(y * 0.01) * 100);
      }
      matrix.push(row);
    }

    const result = await this.workerPool.submitTask({
      type: WorkerTaskType.BILINEAR_INTERPOLATION,
      payload: {
        matrix,
        x: size / 2 + 0.5,
        y: size / 2 + 0.5,
        width: size,
        height: size,
      },
      priority: 1,
      timeout: 5000,
    });

    return result.data;
  }
}
