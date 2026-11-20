import type { WorkerRequest, WorkerResponse } from '../workers/docWorker';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

let workerInstance: Worker | null = null;
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('../workers/docWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerInstance.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (msg.ok) {
          entry.resolve(msg.result);
        } else {
          entry.reject(new Error(msg.error));
        }
      });
      workerInstance.addEventListener('error', (err) => {
        for (const [, entry] of pending) {
          entry.reject(new Error(err.message || 'Web Worker encountered an unexpected error.'));
        }
        pending.clear();
        workerInstance?.terminate();
        workerInstance = null;
      });
    } catch {
      return null;
    }
  }
  return workerInstance;
}

export function runInDocWorker<T>(
  payload: DistributiveOmit<WorkerRequest, 'id'>
): Promise<T> | null {
  const worker = getWorker();
  if (!worker) return null;
  const id = `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    worker.postMessage({ ...payload, id } as WorkerRequest);
  });
}
