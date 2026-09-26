/// <reference lib="webworker" />
import { measureLoudness } from './loudness';
import { computeSpectrogram, detectCutoff, mixdown } from './spectrum';
import { computePeaks } from './peaks';
import { effectiveBitDepth } from './bitdepth';
import { findAlignment } from './align';
import type { WorkerRequest, WorkerResponse, AnalysisResult } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'analyze') {
      const { channels, sampleRate, id } = req;
      post({ id, type: 'progress', stage: 'stagePeaks' });
      const peaks = computePeaks(channels, req.buckets);
      post({ id, type: 'progress', stage: 'stageLoudness' });
      const loudness = measureLoudness(channels, sampleRate);
      const effectiveBits = req.checkBits ? effectiveBitDepth(channels) : undefined;
      post({ id, type: 'progress', stage: 'stageSpectrum' });
      const mono = mixdown(channels);
      const cutoff = detectCutoff(mono, sampleRate);
      const spectrogram = computeSpectrogram(mono, sampleRate, req.columns);
      const result: AnalysisResult = { loudness, cutoff, spectrogram, peaks, effectiveBits };
      post({ id, type: 'analyze', result }, [peaks.buffer, spectrogram.data.buffer, cutoff.spectrumDb.buffer]);
    } else if (req.type === 'align') {
      const result = findAlignment(req.a, req.b, req.sampleRate);
      post({ id: req.id, type: 'align', result });
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
