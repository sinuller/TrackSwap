import type { AlignResult, AnalysisResult, AnalysisStage, WorkerRequest, WorkerResponse } from './types';

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

let nextId = 1;

/**
 * Runs a job in its own worker (so A and B are analysed in parallel) and
 * terminates the worker afterwards to release its memory.
 */
function run<T>(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[], onProgress?: (stage: AnalysisStage) => void): Promise<T> {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.stage);
        return;
      }
      worker.terminate();
      if (msg.type === 'error') reject(new Error(msg.message));
      else resolve((msg as unknown as { result: T }).result);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Analysis worker crashed'));
    };
    worker.postMessage({ ...req, id } as WorkerRequest, transfer);
  });
}

export function analyzeChannels(
  channels: Float32Array[],
  sampleRate: number,
  opts: { columns: number; buckets: number; checkBits: boolean },
  onProgress?: (stage: AnalysisStage) => void,
): Promise<AnalysisResult> {
  return run<AnalysisResult>(
    { type: 'analyze', channels, sampleRate, ...opts },
    channels.map((c) => c.buffer),
    onProgress,
  );
}

export function alignTracks(a: Float32Array, b: Float32Array, sampleRate: number): Promise<AlignResult> {
  return run<AlignResult>({ type: 'align', a, b, sampleRate }, [a.buffer, b.buffer]);
}
