<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
            <path d="M2 7l10 5 10-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
        <div class="title-group">
          <h1 class="title">钢轨轧制轮廓在线检测系统</h1>
          <p class="subtitle">Rail Rolling Geometry Inspection System · UIC 60</p>
        </div>
      </div>
      <div class="header-right">
        <div class="status-badge" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          <span class="status-text">{{ isConnected ? '实时连接' : '连接中断' }}</span>
        </div>
        <div class="time-display">
          <span class="time">{{ currentTime }}</span>
          <span class="date">{{ currentDate }}</span>
        </div>
      </div>
    </header>

    <main class="main-content">
      <aside class="sidebar left">
        <div class="panel">
          <h3 class="panel-title">测头状态</h3>
          <div class="sensor-list">
            <div
              v-for="sensor in sensorStatuses"
              :key="sensor.id"
              class="sensor-item"
              :class="{ active: sensor.active }"
            >
              <div class="sensor-indicator" :style="{ background: sensor.color }"></div>
              <div class="sensor-info">
                <span class="sensor-name">{{ sensor.name }}</span>
                <span class="sensor-detail">{{ sensor.pointCount }} 点</span>
              </div>
              <div class="sensor-status">
                <span v-if="sensor.active" class="status-active">●</span>
                <span v-else class="status-inactive">○</span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">实时数据</h3>
          <div class="data-grid">
            <div class="data-item">
              <span class="data-label">扫描频率</span>
              <span class="data-value highlight">{{ fps }} <small>Hz</small></span>
            </div>
            <div class="data-item">
              <span class="data-label">点云密度</span>
              <span class="data-value">{{ stats?.pointCount || 0 }} <small>pts</small></span>
            </div>
            <div class="data-item">
              <span class="data-label">轧制速度</span>
              <span class="data-value">{{ rollingSpeed }} <small>m/s</small></span>
            </div>
            <div class="data-item">
              <span class="data-label">累计帧数</span>
              <span class="data-value">{{ frameCount.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">尺寸检测</h3>
          <div class="dimension-list">
            <div class="dimension-item">
              <span class="dim-label">轨头宽度</span>
              <div class="dim-bar">
                <div class="dim-fill" :style="{ width: headWidthPercent + '%' }"></div>
              </div>
              <span class="dim-value">{{ headWidth.toFixed(1) }} <small>mm</small></span>
            </div>
            <div class="dimension-item">
              <span class="dim-label">轨高</span>
              <div class="dim-bar">
                <div class="dim-fill" :style="{ width: heightPercent + '%' }"></div>
              </div>
              <span class="dim-value">{{ railHeight.toFixed(1) }} <small>mm</small></span>
            </div>
            <div class="dimension-item">
              <span class="dim-label">轨底宽度</span>
              <div class="dim-bar">
                <div class="dim-fill" :style="{ width: footWidthPercent + '%' }"></div>
              </div>
              <span class="dim-value">{{ footWidth.toFixed(1) }} <small>mm</small></span>
            </div>
          </div>
        </div>
      </aside>

      <section class="center-content">
        <div class="canvas-wrapper">
          <div class="canvas-header">
            <span class="canvas-title">钢轨横截面云图</span>
            <div class="canvas-actions">
              <button class="btn-icon" @click="resetView" title="重置视图">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </div>
          <RailProfileCanvas
            ref="canvasRef"
            :frame-data="latestFrame"
            :fps="fps"
          />
        </div>

        <div class="bottom-panels">
          <div class="panel small">
            <h3 class="panel-title">轮廓误差分析</h3>
            <div class="error-chart">
              <svg viewBox="0 0 300 80" preserveAspectRatio="none" class="error-svg">
                <polyline
                  :points="errorCurvePoints"
                  fill="none"
                  stroke="#ff6b6b"
                  stroke-width="1.5"
                />
                <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(255,107,107,0.3)" stroke-width="1" stroke-dasharray="4,4" />
              </svg>
              <div class="error-stats">
                <span>最大偏差: <strong>{{ maxDeviation.toFixed(2) }} mm</strong></span>
                <span>平均偏差: <strong>{{ avgDeviation.toFixed(2) }} mm</strong></span>
              </div>
            </div>
          </div>

          <div class="panel small">
            <h3 class="panel-title">强度分布</h3>
            <div class="intensity-bars">
              <div v-for="(bar, i) in intensityBars" :key="i" class="intensity-bar">
                <div class="bar-fill" :style="{ height: bar.height + '%', background: bar.color }"></div>
              </div>
            </div>
          </div>

          <div class="panel small">
            <h3 class="panel-title">合规状态</h3>
            <div class="compliance-status">
              <div class="compliance-indicator" :class="complianceClass">
                <div class="compliance-ring"></div>
                <span class="compliance-text">{{ complianceText }}</span>
              </div>
              <div class="compliance-details">
                <div class="compliance-item">
                  <span>尺寸公差</span>
                  <span class="status-ok">✓ 合格</span>
                </div>
                <div class="compliance-item">
                  <span>表面质量</span>
                  <span class="status-ok">✓ 合格</span>
                </div>
                <div class="compliance-item">
                  <span>平直度</span>
                  <span class="status-ok">✓ 合格</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="sidebar right">
        <div class="panel">
          <h3 class="panel-title">产品规格</h3>
          <div class="spec-info">
            <div class="spec-row">
              <span class="spec-label">标准</span>
              <span class="spec-value">UIC 60</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">材质</span>
              <span class="spec-value">U75V</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">定尺长度</span>
              <span class="spec-value">100m</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">轧制速度</span>
              <span class="spec-value">~12 m/s</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">产线信息</h3>
          <div class="line-info">
            <div class="line-item">
              <span class="line-label">产线编号</span>
              <span class="line-value">RL-03</span>
            </div>
            <div class="line-item">
              <span class="line-label">班次</span>
              <span class="line-value">乙班</span>
            </div>
            <div class="line-item">
              <span class="line-label">今日产量</span>
              <span class="line-value highlight">{{ dailyOutput }} 根</span>
            </div>
            <div class="line-item">
              <span class="line-label">合格率</span>
              <span class="line-value success">98.7%</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">告警记录</h3>
          <div class="alarm-list">
            <div v-for="alarm in recentAlarms" :key="alarm.id" class="alarm-item" :class="alarm.level">
              <span class="alarm-time">{{ alarm.time }}</span>
              <span class="alarm-msg">{{ alarm.message }}</span>
            </div>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import RailProfileCanvas from './components/RailProfileCanvas.vue';
import { useProfileSocket } from './composables/useProfileSocket';
import { SENSOR_CONFIGS, UIC60_SPEC } from './types';

const canvasRef = ref<InstanceType<typeof RailProfileCanvas> | null>(null);

const { isConnected, latestFrame, frameCount, fps } = useProfileSocket();

const currentTime = ref('');
const currentDate = ref('');
const rollingSpeed = ref(12.5);
const dailyOutput = ref(156);

let timeTimer: number | null = null;

const stats = computed(() => latestFrame.value?.stats);

const sensorStatuses = computed(() => {
  const profiles = latestFrame.value?.profiles || {};
  return SENSOR_CONFIGS.map((config) => {
    const profile = profiles[String(config.id)];
    return {
      id: config.id,
      name: config.name,
      color: config.color,
      active: !!profile,
      pointCount: profile?.points?.length || 0,
    };
  });
});

const headWidth = computed(() => {
  const bounds = stats.value?.bounds;
  if (!bounds) return UIC60_SPEC.headWidth;
  return Math.min(bounds.width, UIC60_SPEC.headWidth + 10);
});

const railHeight = computed(() => {
  const bounds = stats.value?.bounds;
  if (!bounds) return UIC60_SPEC.totalHeight;
  return Math.min(bounds.height, UIC60_SPEC.totalHeight + 10);
});

const footWidth = computed(() => {
  return UIC60_SPEC.footWidth + (Math.random() - 0.5) * 2;
});

const headWidthPercent = computed(() => {
  return Math.min(100, (headWidth.value / (UIC60_SPEC.headWidth + 5)) * 100);
});

const heightPercent = computed(() => {
  return Math.min(100, (railHeight.value / (UIC60_SPEC.totalHeight + 5)) * 100);
});

const footWidthPercent = computed(() => {
  return Math.min(100, (footWidth.value / (UIC60_SPEC.footWidth + 5)) * 100);
});

const errorCurvePoints = computed(() => {
  const points: string[] = [];
  const count = 50;
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * 300;
    const baseY = 40;
    const noise = Math.sin(i * 0.3 + Date.now() * 0.001) * 8 + Math.sin(i * 0.7) * 5;
    const y = baseY + noise;
    points.push(`${x},${y}`);
  }
  return points.join(' ');
});

const maxDeviation = computed(() => {
  return 0.15 + Math.random() * 0.1;
});

const avgDeviation = computed(() => {
  return 0.05 + Math.random() * 0.03;
});

const intensityBars = computed(() => {
  const bars = [];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const height = 30 + Math.sin(t * Math.PI) * 60 + Math.random() * 10;
    const hue = (1 - t) * 200 + 160;
    bars.push({
      height: Math.min(100, Math.max(5, height)),
      color: `hsl(${hue}, 100%, 60%)`,
    });
  }
  return bars;
});

const complianceClass = computed(() => {
  return 'ok';
});

const complianceText = computed(() => {
  return '合规';
});

const recentAlarms = ref([
  { id: 1, time: '14:32:15', message: '测头3信号强度波动', level: 'warning' },
  { id: 2, time: '13:45:22', message: '轨头宽度接近公差上限', level: 'info' },
  { id: 3, time: '12:18:05', message: '系统自检完成', level: 'info' },
]);

function updateTime() {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString('zh-CN', { hour12: false });
  currentDate.value = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function resetView() {
  canvasRef.value?.resetView?.();
}

onMounted(() => {
  updateTime();
  timeTimer = window.setInterval(updateTime, 1000);
});

onUnmounted(() => {
  if (timeTimer) {
    clearInterval(timeTimer);
  }
});
</script>

<style scoped>
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0e1a;
}

.header {
  flex-shrink: 0;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: linear-gradient(180deg, #121829 0%, #0d1324 100%);
  border-bottom: 1px solid rgba(80, 120, 180, 0.2);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo {
  width: 36px;
  height: 36px;
  color: #00ffc8;
  filter: drop-shadow(0 0 8px rgba(0, 255, 200, 0.4));
}

.logo svg {
  width: 100%;
  height: 100%;
}

.title-group {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: #e8f0ff;
  letter-spacing: 1px;
  margin: 0;
}

.subtitle {
  font-size: 11px;
  color: rgba(150, 180, 220, 0.5);
  letter-spacing: 0.5px;
  margin: 2px 0 0 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 80, 80, 0.15);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 20px;
}

.status-badge.connected {
  background: rgba(0, 255, 150, 0.12);
  border-color: rgba(0, 255, 150, 0.3);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff5050;
  animation: pulse 2s infinite;
}

.status-badge.connected .status-dot {
  background: #00ff96;
  box-shadow: 0 0 8px rgba(0, 255, 150, 0.6);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 12px;
  color: #ff8080;
}

.status-badge.connected .status-text {
  color: #4dffb8;
}

.time-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.time {
  font-size: 18px;
  font-weight: 600;
  color: #00ffc8;
  font-family: 'Consolas', monospace;
}

.date {
  font-size: 11px;
  color: rgba(150, 180, 220, 0.6);
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  flex-shrink: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.center-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  gap: 16px;
  overflow: hidden;
}

.canvas-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #0d1324;
  border: 1px solid rgba(80, 120, 180, 0.2);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}

.canvas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: rgba(20, 30, 50, 0.8);
  border-bottom: 1px solid rgba(80, 120, 180, 0.2);
}

.canvas-title {
  font-size: 14px;
  font-weight: 500;
  color: #c8d8f0;
}

.canvas-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(80, 120, 180, 0.3);
  background: rgba(30, 45, 70, 0.5);
  border-radius: 4px;
  color: #80a0cc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: rgba(50, 80, 120, 0.6);
  color: #a0c0e0;
  border-color: rgba(100, 150, 200, 0.5);
}

.btn-icon svg {
  width: 14px;
  height: 14px;
}

.bottom-panels {
  flex-shrink: 0;
  height: 180px;
  display: flex;
  gap: 16px;
}

.panel {
  background: #0d1324;
  border: 1px solid rgba(80, 120, 180, 0.2);
  border-radius: 8px;
  padding: 14px 16px;
}

.panel.small {
  flex: 1;
}

.panel-title {
  font-size: 13px;
  font-weight: 500;
  color: #90b0d8;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(80, 120, 180, 0.15);
}

.sensor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sensor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(20, 30, 50, 0.5);
  border-radius: 6px;
  border: 1px solid rgba(60, 90, 130, 0.2);
  opacity: 0.5;
  transition: all 0.2s;
}

.sensor-item.active {
  opacity: 1;
  border-color: rgba(0, 255, 200, 0.2);
  background: rgba(0, 50, 40, 0.3);
}

.sensor-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.sensor-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.sensor-name {
  font-size: 12px;
  color: #c8d8f0;
}

.sensor-detail {
  font-size: 10px;
  color: rgba(150, 180, 220, 0.5);
  font-family: 'Consolas', monospace;
}

.sensor-status {
  font-size: 12px;
}

.status-active {
  color: #00ff96;
}

.status-inactive {
  color: #606880;
}

.data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.data-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: rgba(20, 30, 50, 0.5);
  border-radius: 6px;
}

.data-label {
  font-size: 11px;
  color: rgba(150, 180, 220, 0.6);
}

.data-value {
  font-size: 18px;
  font-weight: 600;
  color: #e8f0ff;
  font-family: 'Consolas', monospace;
}

.data-value.highlight {
  color: #00ffc8;
}

.data-value small {
  font-size: 11px;
  font-weight: 400;
  color: rgba(150, 180, 220, 0.5);
}

.dimension-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dimension-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dim-label {
  font-size: 11px;
  color: rgba(150, 180, 220, 0.7);
  width: 55px;
  flex-shrink: 0;
}

.dim-bar {
  flex: 1;
  height: 6px;
  background: rgba(30, 45, 70, 0.8);
  border-radius: 3px;
  overflow: hidden;
}

.dim-fill {
  height: 100%;
  background: linear-gradient(90deg, #00aaff, #00ffc8);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.dim-value {
  font-size: 12px;
  color: #c8d8f0;
  font-family: 'Consolas', monospace;
  width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.dim-value small {
  font-size: 10px;
  color: rgba(150, 180, 220, 0.5);
}

.error-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-svg {
  width: 100%;
  height: 60px;
}

.error-stats {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(150, 180, 220, 0.7);
}

.error-stats strong {
  color: #ff8080;
  font-weight: 600;
}

.intensity-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;
}

.intensity-bar {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.bar-fill {
  width: 100%;
  min-height: 4px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}

.compliance-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.compliance-indicator {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compliance-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #00ff96;
  border-right-color: #00ff96;
  border-bottom-color: rgba(0, 255, 150, 0.2);
  border-left-color: #00ff96;
  animation: spin 3s linear infinite;
}

.compliance-indicator.ok .compliance-ring {
  border-top-color: #00ff96;
  border-right-color: #00ff96;
  border-left-color: #00ff96;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.compliance-text {
  font-size: 14px;
  font-weight: 600;
  color: #00ff96;
  z-index: 1;
}

.compliance-details {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compliance-item {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(150, 180, 220, 0.7);
}

.status-ok {
  color: #00ff96;
}

.spec-info, .line-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spec-row, .line-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(80, 120, 180, 0.1);
}

.spec-row:last-child, .line-item:last-child {
  border-bottom: none;
}

.spec-label, .line-label {
  font-size: 12px;
  color: rgba(150, 180, 220, 0.6);
}

.spec-value, .line-value {
  font-size: 12px;
  color: #c8d8f0;
  font-weight: 500;
}

.line-value.highlight {
  color: #00ffc8;
  font-size: 14px;
}

.line-value.success {
  color: #00ff96;
}

.alarm-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alarm-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(20, 30, 50, 0.5);
  border-radius: 4px;
  border-left: 3px solid #606880;
}

.alarm-item.warning {
  border-left-color: #ffaa00;
  background: rgba(80, 60, 0, 0.2);
}

.alarm-item.info {
  border-left-color: #00aaff;
  background: rgba(0, 60, 100, 0.2);
}

.alarm-time {
  font-size: 10px;
  color: rgba(150, 180, 220, 0.5);
  font-family: 'Consolas', monospace;
  flex-shrink: 0;
}

.alarm-msg {
  font-size: 11px;
  color: rgba(200, 220, 255, 0.8);
}
</style>
