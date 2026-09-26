import { FFT, nextPow2 } from './fft';

export interface AlignResult {
  /** Offset of B relative to A in seconds (positive: B starts later within its file) */
  offset: number;
  /** Normalised correlation at the peak (−1..1); negative = inverted polarity */
  correlation: number;
}

function decimate(x: Float32Array, factor: number): Float64Array {
  const n = Math.floor(x.length / factor);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * factor;
    for (let j = 0; j < factor; j++) s += x[o + j];
    out[i] = s / factor;
  }
  return out;
}

/**
 * Finds the time offset between two (similar) signals via cross-correlation:
 * coarse FFT correlation on a ~4 kHz decimated signal, then refined sample-accurately.
 */
export function findAlignment(a: Float32Array, b: Float32Array, sampleRate: number, maxLagSec = 10): AlignResult {
  const factor = Math.max(1, Math.round(sampleRate / 4000));
  const da = decimate(a, factor);
  const db = decimate(b, factor);
  const size = nextPow2(da.length + db.length);
  const fft = new FFT(size);
  const ar = new Float64Array(size), ai = new Float64Array(size);
  const br = new Float64Array(size), bi = new Float64Array(size);
  ar.set(da);
  br.set(db);
  fft.forward(ar, ai);
  fft.forward(br, bi);
  // R = conj(A) · B  →  r[lag] = Σ a[n]·b[n+lag]
  for (let k = 0; k < size; k++) {
    const re = ar[k] * br[k] + ai[k] * bi[k];
    const im = ar[k] * bi[k] - ai[k] * br[k];
    ar[k] = re;
    ai[k] = im;
  }
  fft.inverse(ar, ai);

  const maxLag = Math.min(Math.floor((maxLagSec * sampleRate) / factor), size / 2 - 1);
  let best = 0, bestVal = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const v = ar[(lag + size) % size];
    if (Math.abs(v) > Math.abs(bestVal)) { bestVal = v; best = lag; }
  }

  // Verfeinerung auf voller Rate in einem energiereichen 1-s-Fenster
  const coarse = best * factor;
  const win = Math.min(sampleRate, Math.floor(a.length / 2));
  let winStart = 0, winEnergy = -1;
  const step = Math.max(1, Math.floor(sampleRate / 4));
  for (let s = Math.max(0, -coarse) + 2 * factor; s + win + 2 * factor < Math.min(a.length, b.length - coarse); s += step) {
    let e = 0;
    for (let i = s; i < s + win; i += 16) e += a[i] * a[i];
    if (e > winEnergy) { winEnergy = e; winStart = s; }
  }
  let fine = coarse, fineVal = -Infinity, fineCorr = 0;
  for (let lag = coarse - 2 * factor; lag <= coarse + 2 * factor; lag++) {
    let s = 0, ea = 0, eb = 0;
    for (let i = winStart; i < winStart + win; i++) {
      const j = i + lag;
      if (j < 0 || j >= b.length) continue;
      s += a[i] * b[j];
      ea += a[i] * a[i];
      eb += b[j] * b[j];
    }
    if (Math.abs(s) > fineVal) {
      fineVal = Math.abs(s);
      fine = lag;
      fineCorr = ea > 0 && eb > 0 ? s / Math.sqrt(ea * eb) : 0;
    }
  }
  return { offset: fine / sampleRate, correlation: fineCorr };
}
