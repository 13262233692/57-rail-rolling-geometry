export enum WorkerTaskType {
  DEVIATION_CALCULATION = 'deviation_calculation',
  BILINEAR_INTERPOLATION = 'bilinear_interpolation',
  NONLINEAR_REGRESSION = 'nonlinear_regression',
  PROFILE_MERGE = 'profile_merge',
  WEAR_ANALYSIS = 'wear_analysis',
}

export interface WorkerTask {
  id: string;
  type: WorkerTaskType;
  payload: any;
  priority: number;
  createdAt: number;
  timeout?: number;
}

export interface WorkerResult {
  taskId: string;
  type: WorkerTaskType;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  workerId: number;
}

export interface ProfileDeviationPayload {
  measuredPoints: Array<{ x: number; y: number; intensity: number }>;
  standardProfile: Array<{ x: number; y: number }>;
  millId: number;
  sectionId: string;
}

export interface BilinearPayload {
  matrix: number[][];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegressionPayload {
  xData: number[];
  yData: number[];
  order: number;
  tolerance: number;
}

export interface DeviationResult {
  millId: number;
  sectionId: string;
  deviations: Array<{
    x: number;
    y: number;
    distance: number;
    direction: number;
    nearestPoint: { x: number; y: number };
  }>;
  maxDeviation: number;
  avgDeviation: number;
  stdDeviation: number;
  wearDepth: number[];
  toleranceExceeded: boolean;
  exceededRegions: Array<{ start: number; end: number; maxDev: number }>;
}

export interface RegressionResult {
  coefficients: number[];
  residuals: number[];
  rSquared: number;
  curvePoints: Array<{ x: number; y: number }>;
}

export interface WorkerPoolConfig {
  minThreads: number;
  maxThreads: number;
  maxQueueSize: number;
  taskTimeout: number;
  idleTimeout: number;
}

export const DEFAULT_WORKER_CONFIG: WorkerPoolConfig = {
  minThreads: 2,
  maxThreads: 8,
  maxQueueSize: 1000,
  taskTimeout: 5000,
  idleTimeout: 30000,
};

export const MILL_COUNT = 4;

export interface MillAnalysisResult {
  millId: number;
  timestamp: number;
  deviation: DeviationResult | null;
  regression: RegressionResult | null;
  mergedProfile: any[] | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  processingTime: number;
}

export interface MillState {
  millId: number;
  latestData: any | null;
  latestResult: MillAnalysisResult | null;
  pendingTaskCount: number;
  totalProcessed: number;
  avgProcessingTime: number;
}
