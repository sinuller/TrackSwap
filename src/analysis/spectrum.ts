import { FFT, hannWindow } from './fft';

/** Dynamic range of the spectrogram (dBFS → 0..255). */
export const SPEC_DB_MIN = -130;
export const SPEC_DB_MAX = 0;

/** Minimum level drop across ~1.2 kHz to count as a cutoff "cliff". */
const CLIFF_MIN_DROP_DB = 18;
/** Everything above the cliff must stay at least this far below the passband. */
const CLIFF_FLOOR_MARGIN_DB = 12;
/** Spectra with less variation above 1 kHz are considered flat (no cutoff). */
const FLAT_SPECTRUM_DB = 20;

export interface Spectrogram {
  /** columns × bins, column-major, 0..255 */
  data: Uint8Array;
  columns: number;
  bins: number;
  sampleRate: number;
}

export interface CutoffResult {
  /** Estimated upper cutoff frequency in Hz */
  cutoffHz: number;
  /** Level drop (dB) around the cutoff */
  dropDb: number;
  /** Steep drop (typical of a lossy low-pass or brick-wall resampling) */
  sharp: boolean;
  /** Average spectrum in dBFS (for display) */
  spectrumDb: Float32Array;
  fftSize: number;
}

/** Mixes all channels down to mono (mean). */
export function mixdown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  const g = 1 / channels.length;
  for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] * g;
  return out;
}

export function computeSpectrogram(mono: Float32Array, sampleRate: number, columns: number): Spectrogram {
  const fftSize = sampleRate > 50000 ? 4096 : 2048;
  const bins = fftSize / 2;
  const fft = new FFT(fftSize);
  const win = hannWindow(fftSize);
  const winSum = win.reduce((a, b) => a + b, 0);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const power = new Float64Array(bins);
  const data = new Uint8Array(columns * bins);
  const len = mono.length;
  const span = len / columns;
  const framesPerCol = Math.max(1, Math.min(4, Math.floor(span / fftSize)));
  const norm = 2 / winSum;
  const scale = 255 / (SPEC_DB_MAX - SPEC_DB_MIN);

  for (let c = 0; c < columns; c++) {
    power.fill(0);
    const colStart = c * span;
    for (let f = 0; f < framesPerCol; f++) {
      const center = colStart + ((f + 0.5) * span) / framesPerCol;
      const start = Math.round(center - fftSize / 2);
      for (let i = 0; i < fftSize; i++) {
        const idx = start + i;
        re[i] = idx >= 0 && idx < len ? mono[idx] * win[i] : 0;
        im[i] = 0;
      }
      fft.forward(re, im);
      for (let k = 0; k < bins; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    }
    const off = c * bins;
    for (let k = 0; k < bins; k++) {
      const mag = Math.sqrt(power[k] / framesPerCol) * norm;
      const db = mag > 0 ? 20 * Math.log10(mag) : SPEC_DB_MIN;
      const v = (db - SPEC_DB_MIN) * scale;
      data[off + k] = v <= 0 ? 0 : v >= 255 ? 255 : v;
    }
  }
  return { data, columns, bins, sampleRate };
}

/**
 * Averages the power spectrum over many frames (skipping silent passages)
 * and estimates the upper cutoff frequency from it.
 */
export function detectCutoff(mono: Float32Array, sampleRate: number): CutoffResult {
  const fftSize = 8192;
  const bins = fftSize / 2;
  const fft = new FFT(fftSize);
  const win = hannWindow(fftSize);
  const winSum = win.reduce((a, b) => a + b, 0);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const acc = new Float64Array(bins);
  const len = mono.length;
  const maxFrames = 400;
  const hop = Math.max(fftSize, Math.floor((len - fftSize) / maxFrames));
  const silence = Math.pow(10, -60 / 20);
  let used = 0;

  for (let start = 0; start + fftSize <= len; start += hop) {
    let sq = 0;
    for (let i = 0; i < fftSize; i++) {
      const s = mono[start + i];
      sq += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    if (Math.sqrt(sq / fftSize) < silence) continue;
    fft.forward(re, im);
    for (let k = 0; k < bins; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }

  const norm = 2 / winSum;
  const spectrumDb = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const mag = used ? Math.sqrt(acc[k] / used) * norm : 0;
    spectrumDb[k] = mag > 0 ? Math.max(-160, 20 * Math.log10(mag)) : -160;
  }

  const binHz = sampleRate / fftSize;
  const nyquist = sampleRate / 2;
  if (!used) return { cutoffHz: 0, dropDb: 0, sharp: false, spectrumDb, fftSize };

  // Smooth over ~200 Hz
  const radius = Math.max(1, Math.round(100 / binHz));
  const smooth = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, k - radius); j <= Math.min(bins - 1, k + radius); j++) { s += spectrumDb[j]; n++; }
    smooth[k] = s / n;
  }

  // 1) Cliff detection: a steep drop (lossy low-pass, brick-wall resampling filter)
  //    followed by a floor that stays low all the way up to Nyquist.
  const w = Math.max(2, Math.round(600 / binHz));
  const k1k = Math.round(1000 / binHz);
  const suffixMax = new Float32Array(bins + 1).fill(-Infinity);
  for (let k = bins - 1; k >= 0; k--) suffixMax[k] = Math.max(smooth[k], suffixMax[k + 1]);
  const mean = (a: number, b: number) => {
    let sum = 0;
    for (let k = a; k <= b; k++) sum += smooth[k];
    return sum / (b - a + 1);
  };
  let cliffK = -1;
  let cliffDrop = 0;
  let cliffBelow = 0;
  let cliffAbove = 0;
  for (let k = bins - 1 - w; k > k1k + w; k--) {
    const below = mean(k - w, k - 1);
    const above = mean(k + 1, k + w);
    const drop = below - above;
    const qualifies = drop >= CLIFF_MIN_DROP_DB && suffixMax[k + 1] <= below - CLIFF_FLOOR_MARGIN_DB;
    if (qualifies && drop > cliffDrop) {
      cliffK = k;
      cliffDrop = drop;
      cliffBelow = below;
      cliffAbove = above;
    } else if (cliffK >= 0 && !qualifies) {
      break; // left the top-most cliff region
    }
  }

  if (cliffK >= 0) {
    // Refine: where the curve crosses the midpoint between the two plateaus
    const mid = (cliffBelow + cliffAbove) / 2;
    let j = Math.min(bins - 1, cliffK + w);
    while (j > cliffK - w && smooth[j] < mid) j--;
    const cutoffHz = Math.min(nyquist, (j + 0.5) * binHz);
    return { cutoffHz, dropDb: cliffDrop, sharp: cutoffHz < nyquist * 0.97, spectrumDb, fftSize };
  }

  // 2) No cliff: bandwidth = highest frequency clearly above the noise floor.
  let floor = Infinity;
  let peak = -Infinity;
  for (let k = k1k; k < bins; k++) {
    floor = Math.min(floor, smooth[k]);
    peak = Math.max(peak, smooth[k]);
  }
  if (peak - floor < FLAT_SPECTRUM_DB) {
    // Essentially flat (e.g. broadband noise): content up to Nyquist
    return { cutoffHz: nyquist, dropDb: 0, sharp: false, spectrumDb, fftSize };
  }
  let k = bins - 1;
  while (k > k1k && smooth[k] < floor + 10) k--;
  const cutoffHz = Math.min(nyquist, (k + 0.5) * binHz);
  return { cutoffHz, dropDb: 0, sharp: false, spectrumDb, fftSize };
}
