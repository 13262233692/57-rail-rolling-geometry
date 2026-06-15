<template>
  <div class="canvas-container" ref="containerRef">
    <canvas ref="canvasRef" class="profile-canvas"></canvas>
    <div class="canvas-overlay">
      <div class="overlay-item">
        <span class="label">帧率</span>
        <span class="value">{{ fps }} FPS</span>
      </div>
      <div class="overlay-item">
        <span class="label">点数</span>
        <span class="value">{{ stats?.pointCount || 0 }}</span>
      </div>
      <div class="overlay-item">
        <span class="label">测头</span>
        <span class="value">{{ stats?.sensorCount || 0 }}/4</span>
      </div>
      <div class="overlay-item">
        <span class="label">帧号</span>
        <span class="value">{{ stats?.frameId || 0 }}</span>
      </div>
    </div>
    <div class="legend">
      <div v-for="sensor in sensorConfigs" :key="sensor.id" class="legend-item">
        <span class="legend-color" :style="{ background: sensor.color }"></span>
        <span class="legend-text">{{ sensor.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { ViewTransform } from '../utils/matrix';
import { generateUIC60Outline } from '../utils/uic60';
import { SENSOR_CONFIGS } from '../types';
import type { FrameData, MergedPoint, LaserProfileData } from '../types';

const props = defineProps<{
  frameData: FrameData | null;
  fps: number;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewTransform = new ViewTransform();

const sensorConfigs = SENSOR_CONFIGS;

const stats = computed(() => props.frameData?.stats);

let ctx: CanvasRenderingContext2D | null = null;
let animationFrameId: number = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let needsFit = true;

const uic60Outline = generateUIC60Outline();

onMounted(() => {
  if (canvasRef.value && containerRef.value) {
    ctx = canvasRef.value.getContext('2d', { alpha: false });
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvasRef.value.addEventListener('mousedown', onMouseDown);
    canvasRef.value.addEventListener('mousemove', onMouseMove);
    canvasRef.value.addEventListener('mouseup', onMouseUp);
    canvasRef.value.addEventListener('mouseleave', onMouseUp);
    canvasRef.value.addEventListener('wheel', onWheel, { passive: false });
    startRenderLoop();
  }
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', resizeCanvas);
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('mousedown', onMouseDown);
    canvasRef.value.removeEventListener('mousemove', onMouseMove);
    canvasRef.value.removeEventListener('mouseup', onMouseUp);
    canvasRef.value.removeEventListener('mouseleave', onMouseUp);
    canvasRef.value.removeEventListener('wheel', onWheel);
  }
});

function resizeCanvas() {
  if (!canvasRef.value || !containerRef.value) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = containerRef.value.getBoundingClientRect();

  canvasRef.value.width = rect.width * dpr;
  canvasRef.value.height = rect.height * dpr;
  canvasRef.value.style.width = rect.width + 'px';
  canvasRef.value.style.height = rect.height + 'px';

  viewTransform.setViewport(rect.width, rect.height);
  needsFit = true;
}

function onMouseDown(e: MouseEvent) {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return;

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  viewTransform.pan(dx, dy);

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();

  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const factor = e.deltaY > 0 ? 0.9 : 1.1;

  viewTransform.zoom(factor, x, y);
}

function startRenderLoop() {
  function render() {
    renderFrame();
    animationFrameId = requestAnimationFrame(render);
  }
  render();
}

function renderFrame() {
  if (!ctx || !canvasRef.value) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvasRef.value.width;
  const height = canvasRef.value.height;

  ctx.save();
  ctx.scale(dpr, dpr);

  drawBackground(ctx, width / dpr, height / dpr);
  drawGrid(ctx);

  if (needsFit && props.frameData?.stats?.bounds) {
    const b = props.frameData.stats.bounds;
    if (b.width > 0 && b.height > 0) {
      viewTransform.fitToBounds(b.minX, b.maxX, b.minY, b.maxY, 80);
      needsFit = false;
    }
  }

  viewTransform.applyToContext(ctx);

  drawUIC60Reference(ctx);
  drawSensorOrigins(ctx);
  drawSensorProfiles(ctx);
  drawMergedProfile(ctx);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) / 2
  );
  gradient.addColorStop(0, '#0f1424');
  gradient.addColorStop(1, '#060912');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(50, 70, 100, 0.15)';
  ctx.lineWidth = 1;

  const gridSize = 20;
  const bounds = props.frameData?.stats?.bounds;

  if (!bounds) return;

  const padding = 50;
  const minX = bounds.minX - padding;
  const maxX = bounds.maxX + padding;
  const minY = bounds.minY - padding;
  const maxY = bounds.maxY + padding;

  const startX = Math.floor(minX / gridSize) * gridSize;
  const startY = Math.floor(minY / gridSize) * gridSize;

  ctx.beginPath();

  for (let x = startX; x <= maxX; x += gridSize) {
    const p1 = viewTransform.worldToScreenPoint(x, minY);
    const p2 = viewTransform.worldToScreenPoint(x, maxY);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }

  for (let y = startY; y <= maxY; y += gridSize) {
    const p1 = viewTransform.worldToScreenPoint(minX, y);
    const p2 = viewTransform.worldToScreenPoint(maxX, y);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }

  ctx.stroke();
}

function drawUIC60Reference(ctx: CanvasRenderingContext2D) {
  if (uic60Outline.length < 2) return;

  ctx.save();

  ctx.strokeStyle = 'rgba(100, 150, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);

  ctx.beginPath();
  ctx.moveTo(uic60Outline[0].x, uic60Outline[0].y);
  for (let i = 1; i < uic60Outline.length; i++) {
    ctx.lineTo(uic60Outline[i].x, uic60Outline[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = 'rgba(60, 100, 180, 0.08)';
  ctx.fill();

  ctx.restore();
}

function drawSensorOrigins(ctx: CanvasRenderingContext2D) {
  for (const config of SENSOR_CONFIGS) {
    const angleRad = (config.angle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const originX = -config.distance * sinA;
    const originY = config.distance * cosA;

    ctx.save();
    ctx.fillStyle = config.color;
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = config.color + '60';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + cosA * 30, originY + sinA * 30);
    ctx.stroke();

    ctx.restore();
  }
}

function drawSensorProfiles(ctx: CanvasRenderingContext2D) {
  if (!props.frameData?.profiles) return;

  for (const [key, profile] of Object.entries(props.frameData.profiles)) {
    const sensorId = parseInt(key);
    const config = SENSOR_CONFIGS.find((c) => c.id === sensorId);
    if (!config) continue;

    const angleRad = (config.angle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const offsetX = -config.distance * sinA;
    const offsetY = config.distance * cosA;

    ctx.save();
    ctx.fillStyle = config.color + '80';
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 2;

    const points = profile.points;
    const step = Math.max(1, Math.floor(points.length / 150));

    for (let i = 0; i < points.length; i += step) {
      const p = points[i];

      const worldX = p.x * cosA - p.y * sinA + offsetX;
      const worldY = p.x * sinA + p.y * cosA + offsetY;

      const size = 1.5 + (p.intensity / 255) * 1.5;

      ctx.beginPath();
      ctx.arc(worldX, worldY, size / viewTransform.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawMergedProfile(ctx: CanvasRenderingContext2D) {
  const merged = props.frameData?.mergedPoints;
  if (!merged || merged.length < 2) return;

  ctx.save();

  ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 255, 200, 0.5)';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(merged[0].x, merged[0].y);
  for (let i = 1; i < merged.length; i++) {
    ctx.lineTo(merged[i].x, merged[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 255, 200, 0.05)';
  ctx.fill();

  drawPointCloud(ctx, merged);

  ctx.restore();
}

function drawPointCloud(ctx: CanvasRenderingContext2D, points: MergedPoint[]) {
  const step = Math.max(1, Math.floor(points.length / 400));

  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const intensity = p.intensity / 255;

    const hue = (1 - intensity) * 200 + 160;
    const alpha = 0.3 + intensity * 0.5;
    const size = 1 + intensity * 2;

    ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.shadowBlur = 4;

    ctx.beginPath();
    ctx.arc(p.x, p.y, size / viewTransform.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resetView() {
  needsFit = true;
}

defineExpose({ resetView });
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #060912;
  border-radius: 8px;
}

.profile-canvas {
  display: block;
  cursor: grab;
}

.profile-canvas:active {
  cursor: grabbing;
}

.canvas-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 16px;
  pointer-events: none;
}

.overlay-item {
  background: rgba(10, 20, 40, 0.8);
  border: 1px solid rgba(80, 120, 180, 0.3);
  border-radius: 6px;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  backdrop-filter: blur(8px);
}

.overlay-item .label {
  font-size: 11px;
  color: rgba(150, 180, 220, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.overlay-item .value {
  font-size: 18px;
  font-weight: 600;
  color: #00ffc8;
  font-family: 'Consolas', 'Monaco', monospace;
}

.legend {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgba(10, 20, 40, 0.8);
  border: 1px solid rgba(80, 120, 180, 0.3);
  border-radius: 6px;
  padding: 10px 14px;
  backdrop-filter: blur(8px);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  box-shadow: 0 0 6px currentColor;
}

.legend-text {
  font-size: 12px;
  color: rgba(180, 210, 255, 0.8);
}
</style>
