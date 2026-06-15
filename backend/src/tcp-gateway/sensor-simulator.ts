import * as net from 'net';
import { PROTOCOL, SENSOR_CONFIGS } from '../common/types';

const UIC60_PROFILE = generateUIC60Profile();

function generateUIC60Profile(): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  const headWidth = 73;
  const headHeight = 30;
  const webThickness = 16.5;
  const webHeight = 90;
  const footWidth = 150;
  const footHeight = 20;
  const totalHeight = 172;

  for (let angle = -60; angle <= 60; angle += 1.5) {
    const rad = (angle * Math.PI) / 180;
    const r = headWidth / 2 + 8;
    points.push({
      x: r * Math.sin(rad),
      y: totalHeight / 2 - headHeight / 2 + r * (1 - Math.cos(rad)),
    });
  }

  for (let y = totalHeight / 2 - headHeight / 2; y >= -totalHeight / 2 + footHeight / 2; y -= 2) {
    const t = (y - (totalHeight / 2 - headHeight / 2)) / (-webHeight - headHeight + footHeight);
    const width = webThickness + (footWidth - webThickness) * Math.max(0, (t - 0.6) / 0.4);
    points.push({ x: -width / 2, y });
    points.unshift({ x: width / 2, y });
  }

  for (let x = footWidth / 2; x >= -footWidth / 2; x -= 2) {
    points.push({ x, y: -totalHeight / 2 + footHeight / 2 });
  }

  return points;
}

class SensorSimulator {
  private socket: net.Socket;
  private sensorId: number;
  private frameId: number = 0;
  private running: boolean = false;
  private readonly FREQUENCY = 200;
  private readonly FRAME_INTERVAL = 1000 / this.FREQUENCY;
  private startOffset: number;
  private noiseLevel: number;

  constructor(sensorId: number) {
    this.sensorId = sensorId;
    this.socket = new net.Socket();
    this.startOffset = Math.random() * Math.PI * 2;
    this.noiseLevel = 0.05 + Math.random() * 0.1;
  }

  connect(port: number, host: string = '127.0.0.1') {
    return new Promise<void>((resolve, reject) => {
      this.socket.connect(port, host, () => {
        console.log(`[Sensor ${this.sensorId}] Connected to port ${port}`);
        this.running = true;
        this.startSending();
        resolve();
      });

      this.socket.on('error', (err) => {
        console.error(`[Sensor ${this.sensorId}] Connection error: ${err.message}`);
        reject(err);
      });

      this.socket.on('close', () => {
        console.log(`[Sensor ${this.sensorId}] Disconnected`);
        this.running = false;
      });
    });
  }

  private startSending() {
    let lastTime = process.hrtime.bigint();

    const sendLoop = () => {
      if (!this.running) return;

      const now = process.hrtime.bigint();
      const elapsed = Number(now - lastTime) / 1e6;

      if (elapsed >= this.FRAME_INTERVAL) {
        this.sendFrame();
        lastTime = now;
      }

      setImmediate(sendLoop);
    };

    sendLoop();
  }

  private sendFrame() {
    const config = SENSOR_CONFIGS.find((c) => c.id === this.sensorId);
    if (!config) return;

    const angleRad = (config.angle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const offsetX = -config.distance * sinA;
    const offsetY = config.distance * cosA;

    const visiblePoints = UIC60_PROFILE.filter((p) => {
      const dx = p.x - offsetX;
      const dy = p.y - offsetY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const angleToPoint = Math.atan2(dy, dx) * 180 / Math.PI;
      const relativeAngle = angleToPoint - config.angle;

      return Math.abs(relativeAngle) < 45 && dist < 300;
    });

    const pointCount = Math.min(visiblePoints.length, PROTOCOL.MAX_POINTS_PER_FRAME);

    const totalLen = PROTOCOL.HEADER_SIZE + 8 + pointCount * PROTOCOL.POINT_SIZE;
    const buffer = Buffer.alloc(totalLen);

    buffer.writeUInt32LE(PROTOCOL.MAGIC_NUMBER, 0);
    buffer.writeUInt32LE(totalLen, 4);

    const timestamp = process.hrtime.bigint();
    const high = Number(timestamp >> 32n);
    const low = Number(timestamp & 0xffffffffn);
    buffer.writeUInt32LE(high, 8);
    buffer.writeUInt32LE(low, 12);

    buffer.writeUInt32LE(this.frameId++, 16);
    buffer.writeUInt16LE(pointCount, 20);
    buffer.writeUInt16LE(0, 22);

    let offset = PROTOCOL.HEADER_SIZE + 8;
    const vibrationPhase = this.startOffset + this.frameId * 0.01;
    const vibration = Math.sin(vibrationPhase) * 0.3;

    for (let i = 0; i < pointCount; i++) {
      const p = visiblePoints[i];
      const noiseX = (Math.random() - 0.5) * this.noiseLevel;
      const noiseY = (Math.random() - 0.5) * this.noiseLevel;
      const noiseZ = (Math.random() - 0.5) * this.noiseLevel;

      const localX = (p.x + vibration + noiseX - offsetX) * cosA + (p.y + noiseY - offsetY) * sinA;
      const localY = -(p.x + vibration + noiseX - offsetX) * sinA + (p.y + noiseY - offsetY) * cosA;

      buffer.writeFloatLE(localX, offset);
      buffer.writeFloatLE(localY, offset + 4);
      buffer.writeFloatLE(noiseZ, offset + 8);
      buffer.writeUInt16LE(Math.floor(200 + Math.random() * 55), offset + 12);
      buffer.writeUInt16LE(0, offset + 14);

      offset += PROTOCOL.POINT_SIZE;
    }

    this.socket.write(buffer);
  }

  disconnect() {
    this.running = false;
    this.socket.destroy();
  }
}

async function main() {
  console.log('Starting laser sensor simulators...');

  const simulators: SensorSimulator[] = [];

  for (const config of SENSOR_CONFIGS) {
    const sim = new SensorSimulator(config.id);
    simulators.push(sim);
    try {
      await sim.connect(config.tcpPort);
    } catch (err) {
      console.error(`Failed to connect sensor ${config.id}: ${err.message}`);
    }
  }

  console.log(`Started ${simulators.length} sensor simulators at 200Hz each`);

  process.on('SIGINT', () => {
    console.log('\nStopping simulators...');
    for (const sim of simulators) {
      sim.disconnect();
    }
    process.exit(0);
  });
}

main().catch(console.error);
