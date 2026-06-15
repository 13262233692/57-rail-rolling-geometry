import { parentPort, workerData } from 'worker_threads';
import {
  WorkerTask,
  WorkerTaskType,
  WorkerResult,
  ProfileDeviationPayload,
  DeviationResult,
  BilinearPayload,
  RegressionPayload,
  RegressionResult,
} from './types';

const workerId = workerData?.workerId || 0;

if (!parentPort) {
  process.exit(1);
}

parentPort.on('message', (task: WorkerTask) => {
  const startTime = performance.now();

  try {
    let result: any;

    switch (task.type) {
      case WorkerTaskType.DEVIATION_CALCULATION:
        result = calculateProfileDeviation(task.payload as ProfileDeviationPayload);
        break;
      case WorkerTaskType.BILINEAR_INTERPOLATION:
        result = bilinearInterpolation(task.payload as BilinearPayload);
        break;
      case WorkerTaskType.NONLINEAR_REGRESSION:
        result = nonlinearRegression(task.payload as RegressionPayload);
        break;
      case WorkerTaskType.PROFILE_MERGE:
        result = mergeProfileData(task.payload);
        break;
      case WorkerTaskType.WEAR_ANALYSIS:
        result = analyzeWearPattern(task.payload);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    const duration = Math.round(performance.now() - startTime);

    const workerResult: WorkerResult = {
      taskId: task.id,
      type: task.type,
      success: true,
      data: result,
      duration,
      workerId,
    };

    parentPort!.postMessage(workerResult);
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const workerResult: WorkerResult = {
      taskId: task.id,
      type: task.type,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      workerId,
    };

    parentPort!.postMessage(workerResult);
  }
});

function calculateProfileDeviation(payload: ProfileDeviationPayload): DeviationResult {
  const { measuredPoints, standardProfile, millId, sectionId } = payload;
  const deviations: DeviationResult['deviations'] = [];
  const wearDepth: number[] = [];

  const standardTree = buildKDTree(standardProfile);
  let maxDev = -Infinity;
  let minDev = Infinity;
  let sumDev = 0;
  const squaredDiffs: number[] = [];

  for (let i = 0; i < measuredPoints.length; i++) {
    const mp = measuredPoints[i];
    const nearest = findNearestPoint(mp.x, mp.y, standardTree, standardProfile);

    const dx = mp.x - nearest.x;
    const dy = mp.y - nearest.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const direction = dx >= 0 ? 1 : -1;
    const signedDistance = distance * direction;

    deviations.push({
      x: mp.x,
      y: mp.y,
      distance: signedDistance,
      direction,
      nearestPoint: nearest,
    });

    if (signedDistance > maxDev) maxDev = signedDistance;
    if (signedDistance < minDev) minDev = signedDistance;
    sumDev += Math.abs(signedDistance);
    squaredDiffs.push(signedDistance * signedDistance);
    wearDepth.push(Math.max(0, -signedDistance));
  }

  const avgDev = sumDev / measuredPoints.length;
  const avgSquared = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(avgSquared - avgDev * avgDev);

  const tolerance = 0.3;
  const exceededRegions: DeviationResult['exceededRegions'] = [];
  let regionStart = -1;
  let regionMaxDev = 0;

  for (let i = 0; i < deviations.length; i++) {
    const absDev = Math.abs(deviations[i].distance);

    if (absDev > tolerance) {
      if (regionStart === -1) {
        regionStart = i;
        regionMaxDev = absDev;
      } else if (absDev > regionMaxDev) {
        regionMaxDev = absDev;
      }
    } else if (regionStart !== -1) {
      exceededRegions.push({
        start: regionStart,
        end: i - 1,
        maxDev: regionMaxDev,
      });
      regionStart = -1;
    }
  }

  if (regionStart !== -1) {
    exceededRegions.push({
      start: regionStart,
      end: deviations.length - 1,
      maxDev: regionMaxDev,
    });
  }

  return {
    millId,
    sectionId,
    deviations,
    maxDeviation: maxDev,
    avgDeviation: avgDev,
    stdDeviation: stdDev,
    wearDepth,
    toleranceExceeded: exceededRegions.length > 0,
    exceededRegions,
  };
}

function bilinearInterpolation(payload: BilinearPayload): number {
  const { matrix, x, y, width, height } = payload;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const fx = x - x0;
  const fy = y - y0;

  const q00 = getMatrixValue(matrix, x0, y0, width, height);
  const q10 = getMatrixValue(matrix, x1, y0, width, height);
  const q01 = getMatrixValue(matrix, x0, y1, width, height);
  const q11 = getMatrixValue(matrix, x1, y1, width, height);

  const r0 = q00 * (1 - fx) + q10 * fx;
  const r1 = q01 * (1 - fx) + q11 * fx;
  const p = r0 * (1 - fy) + r1 * fy;

  return p;
}

function getMatrixValue(matrix: number[][], x: number, y: number, width: number, height: number): number {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  return matrix[y]?.[x] ?? 0;
}

function nonlinearRegression(payload: RegressionPayload): RegressionResult {
  const { xData, yData, order, tolerance } = payload;
  const n = xData.length;

  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j <= order; j++) {
      row.push(Math.pow(xData[i], j));
    }
    X.push(row);
  }

  const coefficients = solveLeastSquares(X, yData, order + 1);

  const residuals: number[] = [];
  let yMean = 0;
  for (let i = 0; i < n; i++) {
    yMean += yData[i];
  }
  yMean /= n;

  let ssTotal = 0;
  let ssResidual = 0;
  const curvePoints: RegressionResult['curvePoints'] = [];

  for (let i = 0; i < n; i++) {
    let yPred = 0;
    for (let j = 0; j < coefficients.length; j++) {
      yPred += coefficients[j] * Math.pow(xData[i], j);
    }
    const residual = yData[i] - yPred;
    residuals.push(residual);
    ssResidual += residual * residual;
    ssTotal += (yData[i] - yMean) * (yData[i] - yMean);
    curvePoints.push({ x: xData[i], y: yPred });
  }

  const rSquared = 1 - ssResidual / ssTotal;

  return {
    coefficients,
    residuals,
    rSquared,
    curvePoints,
  };
}

function solveLeastSquares(X: number[][], y: number[], m: number): number[] {
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < m; i++) {
    A[i] = [];
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < X.length; k++) {
        sum += X[k][i] * X[k][j];
      }
      A[i][j] = sum;
    }
    let sum = 0;
    for (let k = 0; k < X.length; k++) {
      sum += X[k][i] * y[k];
    }
    B[i] = sum;
  }

  return gaussJordan(A, B, m);
}

function gaussJordan(A: number[][], B: number[], n: number): number[] {
  const augmented: number[][] = [];
  for (let i = 0; i < n; i++) {
    augmented[i] = [...A[i], B[i]];
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
        maxRow = row;
      }
    }

    if (maxRow !== col) {
      const temp = augmented[col];
      augmented[col] = augmented[maxRow];
      augmented[maxRow] = temp;
    }

    const pivot = augmented[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = augmented[row][col] / pivot;
        for (let k = col; k <= n; k++) {
          augmented[row][k] -= factor * augmented[col][k];
        }
      }
    }
  }

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result[i] = augmented[i][n] / augmented[i][i];
  }

  return result;
}

interface KDTreeNode {
  index: number;
  x: number;
  y: number;
  left?: KDTreeNode;
  right?: KDTreeNode;
}

function buildKDTree(points: Array<{ x: number; y: number }>): KDTreeNode | undefined {
  if (points.length === 0) return undefined;

  return buildKDTreeRecursive(points.map((p, i) => ({ ...p, index: i })), 0);
}

function buildKDTreeRecursive(
  points: Array<{ x: number; y: number; index: number }>,
  depth: number,
): KDTreeNode | undefined {
  if (points.length === 0) return undefined;

  const axis = depth % 2;
  const sorted = [...points].sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));
  const median = Math.floor(sorted.length / 2);

  const node: KDTreeNode = {
    index: sorted[median].index,
    x: sorted[median].x,
    y: sorted[median].y,
  };

  node.left = buildKDTreeRecursive(sorted.slice(0, median), depth + 1);
  node.right = buildKDTreeRecursive(sorted.slice(median + 1), depth + 1);

  return node;
}

function findNearestPoint(
  x: number,
  y: number,
  root: KDTreeNode | undefined,
  allPoints: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  if (!root) return { x: 0, y: 0 };

  let bestDist = Infinity;
  let bestPoint = { x: root.x, y: root.y };

  function search(node: KDTreeNode | undefined, depth: number) {
    if (!node) return;

    const axis = depth % 2;
    const dist = (x - node.x) ** 2 + (y - node.y) ** 2;

    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = { x: node.x, y: node.y };
    }

    const diff = axis === 0 ? x - node.x : y - node.y;
    const firstSide = diff < 0 ? node.left : node.right;
    const secondSide = diff < 0 ? node.right : node.left;

    search(firstSide, depth + 1);

    if (diff * diff < bestDist) {
      search(secondSide, depth + 1);
    }
  }

  search(root, 0);
  return bestPoint;
}

function mergeProfileData(payload: any) {
  const { profiles, sensorConfigs } = payload;
  const merged: Array<{
    x: number;
    y: number;
    z: number;
    intensity: number;
    sensorId: number;
    angle: number;
  }> = [];

  for (const [sensorIdStr, profile] of Object.entries<any>(profiles)) {
    const sensorId = parseInt(sensorIdStr);
    const config = sensorConfigs.find((c: any) => c.id === sensorId);
    if (!config) continue;

    const angleRad = (config.angle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const offsetX = -config.distance * sinA;
    const offsetY = config.distance * cosA;

    for (const point of profile.points) {
      const rotatedX = point.x * cosA - point.y * sinA;
      const rotatedY = point.x * sinA + point.y * cosA;

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

function analyzeWearPattern(payload: any) {
  const { deviations, historyData } = payload;

  const wearRates: number[] = [];
  const wearRegions: Array<{ position: number; rate: number; severity: string }> = [];

  for (let i = 0; i < deviations.length; i++) {
    const current = deviations[i];
    const historical = historyData?.[i] || 0;
    const wearRate = current - historical;
    wearRates.push(wearRate);

    if (wearRate > 0.1) {
      const severity = wearRate > 0.5 ? 'critical' : wearRate > 0.2 ? 'warning' : 'normal';
      wearRegions.push({ position: i, rate: wearRate, severity });
    }
  }

  return {
    wearRates,
    wearRegions,
    totalWear: wearRates.reduce((a, b) => a + Math.max(0, b), 0),
    maxWearRate: Math.max(...wearRates),
    avgWearRate: wearRates.reduce((a, b) => a + b, 0) / wearRates.length,
  };
}
