import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import {
  WorkerTask,
  WorkerTaskType,
  WorkerResult,
  WorkerPoolConfig,
  DEFAULT_WORKER_CONFIG,
} from './types';

interface PooledWorker {
  worker: Worker;
  id: number;
  busy: boolean;
  currentTask: WorkerTask | null;
  lastActiveTime: number;
  taskCount: number;
}

interface TaskQueueItem {
  task: WorkerTask;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

@Injectable()
export class WorkerPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private workers: PooledWorker[] = [];
  private taskQueue: TaskQueueItem[] = [];
  private config: WorkerPoolConfig;
  private nextWorkerId: number = 0;
  private isShuttingDown: boolean = false;
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    rejectedTasks: 0,
    totalDuration: 0,
  };

  constructor() {
    this.config = { ...DEFAULT_WORKER_CONFIG };
  }

  async onModuleInit() {
    this.logger.log(
      `Initializing worker pool: min=${this.config.minThreads}, max=${this.config.maxThreads}`,
    );

    for (let i = 0; i < this.config.minThreads; i++) {
      await this.spawnWorker();
    }

    setInterval(() => this.monitorPool(), 5000);
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    this.logger.log(`Shutting down worker pool, active workers: ${this.workers.length}`);

    for (const item of this.taskQueue) {
      clearTimeout(item.timeout);
      item.reject(new Error('Worker pool shutting down'));
    }
    this.taskQueue = [];

    for (const pw of this.workers) {
      pw.worker.terminate();
    }
    this.workers = [];
  }

  private async spawnWorker(): Promise<PooledWorker> {
    const workerId = this.nextWorkerId++;

    const workerPath = path.join(__dirname, 'worker-thread.js');

    const worker = new Worker(workerPath, {
      workerData: { workerId },
      env: process.env,
    });

    const pooledWorker: PooledWorker = {
      worker,
      id: workerId,
      busy: false,
      currentTask: null,
      lastActiveTime: Date.now(),
      taskCount: 0,
    };

    worker.on('message', (result: WorkerResult) => {
      this.handleWorkerResult(pooledWorker, result);
    });

    worker.on('error', (error) => {
      this.logger.error(`Worker ${workerId} error: ${error.message}`);
      this.handleWorkerError(pooledWorker, error);
    });

    worker.on('exit', (code) => {
      this.logger.warn(`Worker ${workerId} exited with code ${code}`);
      this.workers = this.workers.filter((w) => w.id !== workerId);

      if (!this.isShuttingDown && this.workers.length < this.config.minThreads) {
        this.spawnWorker().catch((err) => {
          this.logger.error(`Failed to respawn worker: ${err.message}`);
        });
      }
    });

    worker.on('online', () => {
      this.logger.log(`Worker ${workerId} online`);
    });

    this.workers.push(pooledWorker);
    return pooledWorker;
  }

  private handleWorkerResult(pooledWorker: PooledWorker, result: WorkerResult) {
    const task = pooledWorker.currentTask;
    if (!task) return;

    pooledWorker.busy = false;
    pooledWorker.currentTask = null;
    pooledWorker.lastActiveTime = Date.now();
    pooledWorker.taskCount++;

    this.stats.completedTasks++;
    this.stats.totalDuration += result.duration;

    const queueItem = this.taskQueue.find((item) => item.task.id === task.id);
    if (queueItem) {
      clearTimeout(queueItem.timeout);
      this.taskQueue = this.taskQueue.filter((item) => item.task.id !== task.id);

      if (result.success) {
        queueItem.resolve(result);
      } else {
        queueItem.reject(new Error(result.error || 'Task failed'));
      }
    }

    this.processQueue();
  }

  private handleWorkerError(pooledWorker: PooledWorker, error: Error) {
    const task = pooledWorker.currentTask;

    pooledWorker.busy = false;
    pooledWorker.currentTask = null;
    pooledWorker.lastActiveTime = Date.now();

    this.stats.failedTasks++;

    if (task) {
      const queueItem = this.taskQueue.find((item) => item.task.id === task.id);
      if (queueItem) {
        clearTimeout(queueItem.timeout);
        this.taskQueue = this.taskQueue.filter((item) => item.task.id !== task.id);
        queueItem.reject(error);
      }
    }

    this.processQueue();
  }

  async submitTask(task: Omit<WorkerTask, 'id' | 'createdAt'>): Promise<WorkerResult> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    if (this.taskQueue.length >= this.config.maxQueueSize) {
      this.stats.rejectedTasks++;
      throw new Error('Task queue is full');
    }

    const fullTask: WorkerTask = {
      ...task,
      id: this.generateTaskId(),
      createdAt: Date.now(),
    };

    this.stats.totalTasks++;

    return new Promise<WorkerResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.taskQueue = this.taskQueue.filter((item) => item.task.id !== fullTask.id);
        this.stats.failedTasks++;
        reject(new Error(`Task timeout after ${this.config.taskTimeout}ms`));
      }, fullTask.timeout || this.config.taskTimeout);

      this.taskQueue.push({
        task: fullTask,
        resolve,
        reject,
        timeout,
      });

      this.taskQueue.sort((a, b) => b.task.priority - a.task.priority);

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.taskQueue.length === 0) return;
    if (this.isShuttingDown) return;

    const availableWorker = this.workers.find((w) => !w.busy);

    if (availableWorker) {
      const queueItem = this.taskQueue[0];
      await this.executeTask(availableWorker, queueItem.task);
    } else if (this.workers.length < this.config.maxThreads) {
      const newWorker = await this.spawnWorker();
      const queueItem = this.taskQueue[0];
      await this.executeTask(newWorker, queueItem.task);
    }
  }

  private async executeTask(worker: PooledWorker, task: WorkerTask) {
    worker.busy = true;
    worker.currentTask = task;
    worker.worker.postMessage(task);
  }

  private monitorPool() {
    if (this.isShuttingDown) return;

    const now = Date.now();
    const busyCount = this.workers.filter((w) => w.busy).length;
    const avgDuration =
      this.stats.completedTasks > 0
        ? Math.round(this.stats.totalDuration / this.stats.completedTasks)
        : 0;

    this.logger.log(
      `[WorkerPool] total=${this.workers.length} busy=${busyCount} ` +
        `queue=${this.taskQueue.length} completed=${this.stats.completedTasks} ` +
        `failed=${this.stats.failedTasks} rejected=${this.stats.rejectedTasks} ` +
        `avgDuration=${avgDuration}ms`,
    );

    if (
      this.taskQueue.length === 0 &&
      busyCount === 0 &&
      this.workers.length > this.config.minThreads
    ) {
      const idleWorkers = this.workers.filter(
        (w) => now - w.lastActiveTime > this.config.idleTimeout && w.id >= this.config.minThreads,
      );
      for (const idle of idleWorkers.slice(0, this.workers.length - this.config.minThreads)) {
        this.logger.log(`Terminating idle worker ${idle.id}`);
        idle.worker.terminate();
        this.workers = this.workers.filter((w) => w.id !== idle.id);
      }
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      ...this.stats,
      activeWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queueSize: this.taskQueue.length,
      avgDuration:
        this.stats.completedTasks > 0
          ? Math.round(this.stats.totalDuration / this.stats.completedTasks)
          : 0,
    };
  }
}
