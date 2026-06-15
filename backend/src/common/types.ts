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

export interface SensorConfig {
  id: number;
  name: string;
  angle: number;
  distance: number;
  tcpPort: number;
}

export const SENSOR_CONFIGS: SensorConfig[] = [
  { id: 1, name: 'HORIZONTAL_TOP', angle: 0, distance: 150, tcpPort: 8081 },
  { id: 2, name: 'VERTICAL_LEFT', angle: 90, distance: 150, tcpPort: 8082 },
  { id: 3, name: 'HORIZONTAL_BOTTOM', angle: 180, distance: 150, tcpPort: 8083 },
  { id: 4, name: 'VERTICAL_RIGHT', angle: 270, distance: 150, tcpPort: 8084 },
];

export const PROTOCOL = {
  HEADER_SIZE: 16,
  MAGIC_NUMBER: 0x5247454F,
  POINT_SIZE: 16,
  MAX_POINTS_PER_FRAME: 2048,
};

export const REDIS_KEYS = {
  LATEST_PROFILE: 'rail:profile:latest',
  PROFILE_HISTORY: 'rail:profile:history',
  SENSOR_STATUS: 'rail:sensor:status',
  FRAME_COUNT: 'rail:frame:count',
};

export const MILL_COUNT = 4;
