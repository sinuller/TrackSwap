import type { TrackMeta } from '../analysis/metadata';
import type { AnalysisResult } from '../analysis/types';
import { fmtKHz } from './format';
import { t } from './i18n.svelte';

export type HintLevel = 'info' | 'warn' | 'bad' | 'good';
export interface Hint { level: HintLevel; text: string }

/** Heuristic quality hints for a single file. */
export function trackHints(meta: TrackMeta | null, analysis: AnalysisResult | null, analysisRate?: number): Hint[] {
  const hints: Hint[] = [];
  if (!meta || !analysis) return hints;
  const { cutoff, loudness } = analysis;
  const rate = meta.sampleRate ?? analysisRate ?? 0;

  if (cutoff.cutoffHz > 0) {
    const khz = fmtKHz(cutoff.cutoffHz);
    if (meta.lossless && cutoff.sharp && cutoff.cutoffHz < 19500 && rate <= 48000) {
      hints.push({ level: 'bad', text: t('hintFakeLossless', { khz }) });
    } else if (rate >= 88200 && cutoff.cutoffHz < 24500) {
      hints.push({ level: 'warn', text: t('hintUpsampled', { khz }) });
    } else if (meta.lossless === false && cutoff.sharp) {
      hints.push({ level: 'info', text: t('hintEncoderLowpass', { khz }) });
    } else if (meta.lossless && !cutoff.sharp) {
      hints.push({ level: 'good', text: t('hintFullBandwidth', { khz }) });
    }
  }

  const eff = analysis.effectiveBits;
  if (meta.lossless && meta.bitsPerSample && eff && eff < meta.bitsPerSample && eff <= 16) {
    hints.push({ level: 'warn', text: t('hintPaddedBits', { declared: meta.bitsPerSample, eff }) });
  }

  if (loudness.clipEvents > 0) {
    hints.push({ level: loudness.clipEvents > 50 ? 'bad' : 'warn', text: t('hintClipping', { n: loudness.clipEvents }) });
  }
  if (loudness.truePeak > 0.05) {
    hints.push({ level: 'warn', text: t('hintTruePeak', { db: loudness.truePeak.toFixed(1) }) });
  }
  if (Number.isFinite(loudness.integrated) && loudness.plr < 8) {
    hints.push({ level: 'info', text: t('hintCompressed', { plr: loudness.plr.toFixed(1) }) });
  }
  return hints;
}
