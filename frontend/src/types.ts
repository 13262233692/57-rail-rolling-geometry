export interface ProfilePoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export interface LaserProfileData {
  timestamp: string;
  sensorId: number;
  frameId: number;
  points: ProfilePoint[];
}

export interface MergedPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
  sensorId: number;
  angle: number;
}

export interface FrameData {
  timestamp: number;
  frameId: number;
  profiles: Record<string, LaserProfileData>;
  mergedPoints: MergedPoint[];
  stats: FrameStats;
}

export interface FrameStats {
  pointCount: number;
  sensorCount: number;
  frameId: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  avgIntensity: number;
  fps: number;
}

export interface SensorConfig {
  id: number;
  name: string;
  angle: number;
  distance: number;
  color: string;
}

export const SENSOR_CONFIGS: SensorConfig[] = [
  { id: 1, name: '顶部水平测头', angle: 0, distance: 150, color: '#00ff88' },
  { id: 2, name: '左侧垂直测头', angle: 90, distance: 150, color: '#00aaff' },
  { id: 3, name: '底部水平测头', angle: 180, distance: 150, color: '#ff6600' },
  { id: 4, name: '右侧垂直测头', angle: 270, distance: 150, color: '#ff00aa' },
];

export const UIC60_SPEC = {
  totalHeight: 172,
  headWidth: 73,
  headHeight: 30,
  webThickness: 16.5,
  webHeight: 90,
  footWidth: 150,
  footHeight: 20,
};
