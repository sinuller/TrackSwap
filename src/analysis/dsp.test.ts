import { describe, expect, it } from 'vitest';
import { FFT } from './fft';
import { detectCutoff, computeSpectrogram, mixdown } from './spectrum';
import { effectiveBitDepth } from './bitdepth';
import { findAlignment } from './align';
import { computePeaks } from './peaks';
import { noise, sine } from './testsignals';

/** Ideal (brick-wall) low-pass via FFT of the whole signal. */
function brickwall(x: Float32Array, rate: number, cutoffHz: number): Float32Array {
  let n = 1;
  while (n < x.length) n <<= 1;
  const fft = new FFT(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft.forward(re, im);
  const kc = Math.round((cutoffHz / rate) * n);
  for (let k = kc; k <= n - kc; k++) {
    re[k] = 0;
    im[k] = 0;
  }
  fft.inverse(re, im);
  return Float32Array.from(re.subarray(0, x.length));
}

describe('FFT', () => {
  it('round-trips forward/inverse', () => {
    const fft = new FFT(1024);
    const x = noise(1024);
    const re = Float64Array.from(x);
    const im = new Float64Array(1024);
    fft.forward(re, im);
    fft.inverse(re, im);
    for (let i = 0; i < 1024; i++) expect(re[i]).toBeCloseTo(x[i], 9);
  });

  it('puts a bin-centred sine into the expected bin', () => {
    const n = 2048;
    const fft = new FFT(n);
    const re = Float64Array.from(sine((100 * 48000) / n, 1, n / 48000, 48000));
    const im = new Float64Array(n);
    fft.forward(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    expect(best).toBe(100);
  });

  it('rejects sizes that are not a power of two', () => {
    expect(() => new FFT(1000)).toThrow();
  });
});

describe('detectCutoff', () => {
  const rate = 44100;
  const white = noise(rate * 8, 0.3, 7);

  it('detects a 16 kHz lossy-style low-pass as a sharp cutoff', () => {
    const r = detectCutoff(brickwall(white, rate, 16000), rate);
    expect(r.cutoffHz).toBeGreaterThan(15500);
    expect(r.cutoffHz).toBeLessThan(16500);
    expect(r.sharp).toBe(true);
  });

  it('reports full bandwidth for broadband material', () => {
    const r = detectCutoff(white, rate);
    expect(r.cutoffHz).toBeGreaterThan(21000);
    expect(r.sharp).toBe(false);
  });

  it('finds the 22 kHz limit of upsampled 44.1 kHz material in a 96 kHz file', () => {
    const r = detectCutoff(brickwall(noise(96000 * 6, 0.3, 3), 96000, 22000), 96000);
    expect(r.cutoffHz).toBeGreaterThan(21000);
    expect(r.cutoffHz).toBeLessThan(23000);
  });

  it('handles silence', () => {
    expect(detectCutoff(new Float32Array(rate * 2), rate).cutoffHz).toBe(0);
  });
});

describe('spectrogram', () => {
  it('has the requested shape and shows a tone in the right bin', () => {
    const rate = 48000;
    const spec = computeSpectrogram(sine(6000, 0.5, 4, rate), rate, 100);
    expect(spec.columns).toBe(100);
    expect(spec.data.length).toBe(100 * spec.bins);
    const col = spec.data.subarray(50 * spec.bins, 51 * spec.bins);
    let best = 0;
    for (let k = 0; k < spec.bins; k++) if (col[k] > col[best]) best = k;
    expect(Math.abs((best * rate) / (spec.bins * 2) - 6000)).toBeLessThan(50);
  });
});

describe('effectiveBitDepth', () => {
  const quantize = (x: Float32Array, bits: number) => x.map((v) => Math.round(v * 2 ** (bits - 1)) / 2 ** (bits - 1));

  it('recognises 16-bit material (e.g. in a 24-bit container)', () => {
    expect(effectiveBitDepth([quantize(noise(100000), 16)])).toBe(16);
  });

  it('recognises genuine 24-bit material', () => {
    expect(effectiveBitDepth([quantize(noise(100000), 24)])).toBe(24);
  });

  it('returns 32 for float material and undefined for silence', () => {
    expect(effectiveBitDepth([noise(100000)])).toBe(32);
    expect(effectiveBitDepth([new Float32Array(1000)])).toBeUndefined();
  });
});

describe('findAlignment', () => {
  const rate = 44100;
  const a = noise(rate * 20, 0.4, 11);

  it('finds a positive offset sample-accurately', () => {
    const lag = 1234;
    const b = new Float32Array(a.length + lag);
    b.set(a, lag);
    const r = findAlignment(a, b, rate);
    expect(Math.round(r.offset * rate)).toBe(lag);
    expect(r.correlation).toBeGreaterThan(0.99);
  });

  it('finds a negative offset', () => {
    const lag = 777;
    const b = a.subarray(lag);
    const r = findAlignment(a, b, rate);
    expect(Math.round(r.offset * rate)).toBe(-lag);
  });

  it('reports inverted polarity as negative correlation', () => {
    const b = a.map((v) => -v);
    const r = findAlignment(a, b, rate);
    expect(Math.round(r.offset * rate)).toBe(0);
    expect(r.correlation).toBeLessThan(-0.99);
  });
});

describe('computePeaks / mixdown', () => {
  it('reports min, max and RMS per bucket', () => {
    const x = new Float32Array([0.5, -0.5, 0.5, -0.5, 0, 0, 0, 0]);
    const p = computePeaks([x], 2);
    expect([p[0], p[1], p[2]]).toEqual([-0.5, 0.5, 0.5]);
    expect([p[3], p[4], p[5]]).toEqual([0, 0, 0]);
  });

  it('averages channels', () => {
    const m = mixdown([new Float32Array([1, 0]), new Float32Array([0, 1])]);
    expect(Array.from(m)).toEqual([0.5, 0.5]);
  });
});
