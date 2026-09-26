/** Deterministic test signals for the unit tests. */

export function sine(freq: number, amplitude: number, seconds: number, rate: number, phase = 0): Float32Array {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate + phase);
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Reproducible white noise in [-amplitude, amplitude). */
export function noise(n: number, amplitude = 0.5, seed = 1): Float32Array {
  let s = seed >>> 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 4294967296 - 0.5) * 2 * amplitude;
  }
  return out;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);
