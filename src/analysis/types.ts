import type { LoudnessResult } from './loudness';
import type { CutoffResult, Spectrogram } from './spectrum';
import type { AlignResult } from './align';

export type { LoudnessResult, CutoffResult, Spectrogram, AlignResult };

/** Progress stages reported by the worker (message keys). */
export type AnalysisStage = 'stagePeaks' | 'stageLoudness' | 'stageSpectrum';

export interface AnalysisResult {
  loudness: LoudnessResult;
  cutoff: CutoffResult;
  spectrogram: Spectrogram;
  /** Waveform buckets [min, max, rms] × n */
  peaks: Float32Array;
  /** Effective bit depth (only meaningful for PCM/lossless) */
  effectiveBits?: number;
}

export type WorkerRequest =
  | { id: number; type: 'analyze'; channels: Float32Array[]; sampleRate: number; columns: number; buckets: number; checkBits: boolean }
  | { id: number; type: 'align'; a: Float32Array; b: Float32Array; sampleRate: number };

export type WorkerResponse =
  | { id: number; type: 'progress'; stage: AnalysisStage }
  | { id: number; type: 'analyze'; result: AnalysisResult }
  | { id: number; type: 'align'; result: AlignResult }
  | { id: number; type: 'error'; message: string };
