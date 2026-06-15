import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import type { FrameData } from '../types';

export function useProfileSocket(url: string = 'http://localhost:3000/profile') {
  const socket = ref<Socket | null>(null);
  const isConnected = ref(false);
  const latestFrame = ref<FrameData | null>(null);
  const frameCount = ref(0);
  const fps = ref(0);

  let frameTimes: number[] = [];
  let reconnectTimer: number | null = null;
  const RECONNECT_DELAY = 3000;

  const connect = () => {
    if (socket.value?.connected) return;

    try {
      const s = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      s.on('connect', () => {
        isConnected.value = true;
        console.log('[WS] Connected to profile stream');
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      });

      s.on('disconnect', () => {
        isConnected.value = false;
        console.log('[WS] Disconnected from profile stream');
      });

      s.on('init', (data) => {
        console.log('[WS] Initial data received');
      });

      s.on('fullFrame', (data: FrameData) => {
        latestFrame.value = data;
        frameCount.value++;

        const now = performance.now();
        frameTimes.push(now);
        frameTimes = frameTimes.filter((t) => now - t < 1000);
        fps.value = frameTimes.length;
      });

      s.on('error', (err) => {
        console.error('[WS] Error:', err);
      });

      s.on('connect_error', (err) => {
        console.warn('[WS] Connection error:', err.message);
        isConnected.value = false;
      });

      socket.value = s;
    } catch (err) {
      console.error('[WS] Failed to create socket:', err);
    }
  };

  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }
    isConnected.value = false;
  };

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
  });

  return {
    socket,
    isConnected,
    latestFrame,
    frameCount,
    fps,
    connect,
    disconnect,
  };
}
