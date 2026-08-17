/**
 * Sequential AI / processing task queue with pause, resume, cancel, and job persistence.
 */

import { EVENTS, JOB_STATUS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { jobRepository } from '../repositories/index.js';

/**
 * @typedef {{
 *   id?: string,
 *   type: string,
 *   documentId?: string|null,
 *   label?: string,
 *   payload?: unknown,
 *   run: (ctx: { job: object, signal: AbortSignal, onProgress: (p: object) => Promise<void> }) => Promise<unknown>
 * }} TaskSpec
 */

export class TaskQueue {
  constructor() {
    /** @type {Array<{ spec: TaskSpec, job: object, resolve: Function, reject: Function, controller: AbortController }>} */
    this._pending = [];
    this._running = false;
    this._paused = false;
    /** @type {{ spec: TaskSpec, job: object, resolve: Function, reject: Function, controller: AbortController }|null} */
    this._current = null;
    /** @type {((v?: void) => void)|null} */
    this._resumeWait = null;
  }

  get paused() {
    return this._paused;
  }

  get size() {
    return this._pending.length + (this._current ? 1 : 0);
  }

  /**
   * Enqueue a task. Persists a job row and returns a promise for the task result.
   * @param {TaskSpec} spec
   */
  enqueue(spec) {
    const at = nowIso();
    const job = {
      id: spec.id || uuid(),
      type: spec.type,
      documentId: spec.documentId ?? null,
      label: spec.label || spec.type,
      status: JOB_STATUS.PENDING,
      progress: 0,
      message: 'Queued',
      error: null,
      result: null,
      createdAt: at,
      updatedAt: at,
    };

    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const entry = { spec, job, resolve, reject, controller };
      this._pending.push(entry);
      jobRepository.put(job).catch(() => {});
      emit(EVENTS.JOB_PROGRESS, { ...job });
      this._pump();
    });
  }

  pause() {
    this._paused = true;
    if (this._current) {
      this._current.job.status = JOB_STATUS.PAUSED;
      this._current.job.updatedAt = nowIso();
      jobRepository.put(this._current.job).catch(() => {});
      emit(EVENTS.JOB_PROGRESS, { ...this._current.job });
    }
  }

  resume() {
    this._paused = false;
    if (this._current) {
      this._current.job.status = JOB_STATUS.RUNNING;
      this._current.job.updatedAt = nowIso();
      jobRepository.put(this._current.job).catch(() => {});
      emit(EVENTS.JOB_PROGRESS, { ...this._current.job });
    }
    if (this._resumeWait) {
      const r = this._resumeWait;
      this._resumeWait = null;
      r();
    }
    this._pump();
  }

  /**
   * Cancel the current task and optionally drain the queue.
   * @param {{ drain?: boolean }} [opts]
   */
  cancel(opts = {}) {
    const drain = opts.drain !== false;
    if (this._current) {
      this._current.controller.abort();
      this._current.job.status = JOB_STATUS.CANCELLED;
      this._current.job.message = 'Cancelled';
      this._current.job.updatedAt = nowIso();
      jobRepository.put(this._current.job).catch(() => {});
      emit(EVENTS.JOB_PROGRESS, { ...this._current.job });
      this._current.reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
      this._current = null;
    }
    if (drain) {
      while (this._pending.length) {
        const entry = this._pending.shift();
        entry.job.status = JOB_STATUS.CANCELLED;
        entry.job.message = 'Cancelled';
        entry.job.updatedAt = nowIso();
        jobRepository.put(entry.job).catch(() => {});
        emit(EVENTS.JOB_PROGRESS, { ...entry.job });
        entry.reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
      }
    }
    this._paused = false;
    if (this._resumeWait) {
      const r = this._resumeWait;
      this._resumeWait = null;
      r();
    }
    this._running = false;
    this._pump();
  }

  /**
   * Cancel a specific job by id (pending or current).
   * @param {string} jobId
   */
  cancelJob(jobId) {
    if (this._current?.job.id === jobId) {
      this.cancel({ drain: false });
      return;
    }
    const idx = this._pending.findIndex((e) => e.job.id === jobId);
    if (idx >= 0) {
      const [entry] = this._pending.splice(idx, 1);
      entry.controller.abort();
      entry.job.status = JOB_STATUS.CANCELLED;
      entry.job.message = 'Cancelled';
      entry.job.updatedAt = nowIso();
      jobRepository.put(entry.job).catch(() => {});
      emit(EVENTS.JOB_PROGRESS, { ...entry.job });
      entry.reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
    }
  }

  async _waitIfPaused() {
    if (!this._paused) return;
    await new Promise((resolve) => {
      this._resumeWait = resolve;
    });
  }

  async _pump() {
    if (this._running) return;
    if (this._paused) return;
    const next = this._pending.shift();
    if (!next) return;

    this._running = true;
    this._current = next;
    const { spec, job, resolve, reject, controller } = next;

    job.status = JOB_STATUS.RUNNING;
    job.progress = 0;
    job.message = 'Running';
    job.updatedAt = nowIso();
    await jobRepository.put(job);
    emit(EVENTS.JOB_PROGRESS, { ...job });

    const onProgress = async (p) => {
      await this._waitIfPaused();
      if (controller.signal.aborted) return;
      job.progress = Math.max(0, Math.min(100, Number(p.progress ?? p.percent ?? job.progress) || 0));
      job.message = p.message || job.message;
      job.updatedAt = nowIso();
      await jobRepository.put(job);
      emit(EVENTS.JOB_PROGRESS, { ...job, ...p });
    };

    try {
      await this._waitIfPaused();
      const result = await spec.run({
        job,
        signal: controller.signal,
        onProgress,
      });
      if (controller.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });

      job.status = JOB_STATUS.DONE;
      job.progress = 100;
      job.message = 'Done';
      job.result = result ?? null;
      job.updatedAt = nowIso();
      await jobRepository.put(job);
      emit(EVENTS.JOB_PROGRESS, { ...job });
      resolve(result);
    } catch (err) {
      const cancelled = err?.name === 'AbortError' || job.status === JOB_STATUS.CANCELLED;
      job.status = cancelled ? JOB_STATUS.CANCELLED : JOB_STATUS.FAILED;
      job.error = err?.message || String(err);
      job.message = cancelled ? 'Cancelled' : job.error;
      job.updatedAt = nowIso();
      await jobRepository.put(job);
      emit(EVENTS.JOB_PROGRESS, { ...job });
      reject(err);
    } finally {
      this._current = null;
      this._running = false;
      queueMicrotask(() => this._pump());
    }
  }
}

/** Shared app-wide queue */
export const taskQueue = new TaskQueue();
