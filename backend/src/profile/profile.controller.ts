import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileAnalysisService } from '../workers/profile-analysis.service';
import { MILL_COUNT } from '../common/types';
import type { MillAnalysisResult, MillState } from '../workers/types';

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly analysisService: ProfileAnalysisService,
  ) {}

  @Get('latest')
  getLatestProfiles(): {
    success: boolean;
    data: {
      profiles: { [key: string]: object };
      frameCount: number;
    };
  } {
    const profiles = this.profileService.getLatestProfiles();
    const result: { [key: string]: object } = {};
    profiles.forEach((profile, id) => {
      result[String(id)] = profile;
    });
    return {
      success: true,
      data: {
        profiles: result,
        frameCount: this.profileService.getFrameCount(),
      },
    };
  }

  @Get('status')
  getStatus(): {
    success: boolean;
    data: {
      frameCount: number;
      sensorCount: number;
      eventLoopLag: number;
      workerStats: any;
      millCount: number;
      timestamp: number;
    };
  } {
    return {
      success: true,
      data: {
        frameCount: this.profileService.getFrameCount(),
        sensorCount: this.profileService.getLatestProfiles().size,
        eventLoopLag: this.profileService.getEventLoopLag(),
        workerStats: this.profileService.getWorkerStats(),
        millCount: MILL_COUNT,
        timestamp: Date.now(),
      },
    };
  }

  @Get('workers/status')
  getWorkerStatus(): {
    success: boolean;
    data: {
      workerStats: any;
      millStates: { [key: string]: MillState | undefined };
      latestResults: { [key: string]: MillAnalysisResult | null };
      eventLoopLag: number;
    };
  } {
    const millStatesObj: { [key: string]: MillState | undefined } = {};
    this.analysisService.getAllMillStates().forEach((val, key) => {
      millStatesObj[String(key)] = val;
    });

    const latestResultsObj: { [key: string]: MillAnalysisResult | null } = {};
    this.analysisService.getAllLatestResults().forEach((val, key) => {
      latestResultsObj[String(key)] = val;
    });

    return {
      success: true,
      data: {
        workerStats: this.analysisService.getWorkerStats(),
        millStates: millStatesObj,
        latestResults: latestResultsObj,
        eventLoopLag: this.profileService.getEventLoopLag(),
      },
    };
  }

  @Get('analysis/:millId')
  getMillAnalysis(@Param('millId') millIdStr: string): {
    success: boolean;
    error?: string;
    data?: {
      millId: number;
      analysis: any;
      millState: MillState | undefined;
    };
  } {
    const millId = parseInt(millIdStr, 10);
    if (isNaN(millId) || millId < 1 || millId > MILL_COUNT) {
      return {
        success: false,
        error: `Invalid mill ID: ${millIdStr}. Must be 1-${MILL_COUNT}`,
      };
    }

    const result = this.profileService.getAnalysisResult(millId);
    const millState = this.analysisService.getMillState(millId);

    return {
      success: true,
      data: {
        millId,
        analysis: result,
        millState,
      },
    };
  }

  @Get('analysis/all')
  getAllMillAnalysis() {
    const results: { [key: string]: any } = {};
    const states: { [key: string]: any } = {};

    for (let millId = 1; millId <= MILL_COUNT; millId++) {
      results[String(millId)] = this.profileService.getAnalysisResult(millId);
      states[String(millId)] = this.analysisService.getMillState(millId);
    }

    return {
      success: true,
      data: {
        results,
        states,
        eventLoopLag: this.profileService.getEventLoopLag(),
        workerStats: this.analysisService.getWorkerStats(),
      },
    };
  }

  @Get('stress-test/interpolation')
  async runInterpolationStressTest(@Query('size') sizeStr?: string) {
    const size = parseInt(sizeStr || '1000', 10);
    const startTime = Date.now();
    const initialLag = this.profileService.getEventLoopLag();

    const promises: Promise<number>[] = [];
    for (let i = 0; i < MILL_COUNT; i++) {
      promises.push(this.analysisService.runBilinearInterpolationTest(size));
    }

    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    const finalLag = this.profileService.getEventLoopLag();

    return {
      success: true,
      data: {
        matrixSize: size,
        concurrentTasks: MILL_COUNT,
        results,
        totalTime,
        avgTimePerTask: Math.round(totalTime / MILL_COUNT),
        eventLoopLagBefore: initialLag,
        eventLoopLagAfter: finalLag,
        workerStats: this.analysisService.getWorkerStats(),
        timestamp: Date.now(),
      },
    };
  }

  @Get('health')
  getHealthCheck() {
    const workerStats = this.analysisService.getWorkerStats();
    const millStates = this.analysisService.getAllMillStates();

    let allMillsHealthy = true;
    for (const state of millStates.values()) {
      if (state.pendingTaskCount > 10) {
        allMillsHealthy = false;
        break;
      }
    }

    const eventLoopLag = this.profileService.getEventLoopLag();
    const healthy = eventLoopLag < 100 && workerStats.queueSize < 100 && allMillsHealthy;

    return {
      success: true,
      data: {
        healthy,
        eventLoopLag,
        workerStats,
        activeSensors: this.profileService.getLatestProfiles().size,
        millCount: MILL_COUNT,
        pendingTasks: workerStats.queueSize,
        processedTasks: workerStats.completedTasks,
        timestamp: Date.now(),
      },
    };
  }
}
