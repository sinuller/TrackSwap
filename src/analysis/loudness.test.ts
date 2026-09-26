import { describe, expect, it } from 'vitest';
import { measureLoudness } from './loudness';
import { concat, dbToGain, sine } from './testsignals';

// Reference cases from EBU Tech 3341 (loudness) and EBU Tech 3342 (loudness range)
describe('measureLoudness – EBU Tech 3341/3342 reference cases', () => {
  for (const rate of [44100, 48000, 96000]) {
    it(`1 kHz stereo sine at -23 dBFS reads -23.0 LUFS (${rate} Hz)`, () => {
      const s = sine(1000, dbToGain(-23), 20, rate);
      const r = measureLoudness([s, s], rate);
      expect(r.integrated).toBeCloseTo(-23, 1);
    });
  }

  it('1 kHz stereo sine at -33 dBFS reads -33.0 LUFS', () => {
    const s = sine(1000, dbToGain(-33), 20, 48000);
    expect(measureLoudness([s, s], 48000).integrated).toBeCloseTo(-33, 1);
  });

  it('a single 0 dBFS channel reads -3.01 LUFS (BS.1770)', () => {
    const s = sine(1000, 1, 10, 48000);
    const silent = new Float32Array(s.length);
    expect(measureLoudness([s, silent], 48000).integrated).toBeCloseTo(-3.01, 1);
  });

  const seq = (rate: number, parts: [number, number][]) => concat(...parts.map(([db, sec]) => sine(1000, dbToGain(db), sec, rate)));
  const within = (value: number, expected: number, tol = 0.1) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(tol);

  it('case 3 – relative gate: -36/-23/-36 dBFS (10/60/10 s) reads -23.0 ±0.1 LUFS', () => {
    const s = seq(48000, [[-36, 10], [-23, 60], [-36, 10]]);
    within(measureLoudness([s, s], 48000).integrated, -23);
  });

  it('case 4 – absolute gate: -72/-36/-23/-36/-72 dBFS reads -23.0 ±0.1 LUFS', () => {
    const s = seq(48000, [[-72, 10], [-36, 10], [-23, 60], [-36, 10], [-72, 10]]);
    within(measureLoudness([s, s], 48000).integrated, -23);
  });

  it('case 5 – -26/-20/-26 dBFS (20/20.1/20 s) reads -23.0 ±0.1 LUFS', () => {
    const s = seq(48000, [[-26, 20], [-20, 20.1], [-26, 20]]);
    within(measureLoudness([s, s], 48000).integrated, -23);
  });

  it('loudness range: 20 s at -20 dBFS then 20 s at -30 dBFS gives 10 LU (Tech 3342 case 1)', () => {
    const rate = 48000;
    const s = concat(sine(1000, dbToGain(-20), 20, rate), sine(1000, dbToGain(-30), 20, rate));
    expect(Math.abs(measureLoudness([s, s], rate).range - 10)).toBeLessThanOrEqual(1);
  });

  it('digital silence reads -Infinity without throwing', () => {
    const s = new Float32Array(48000 * 5);
    const r = measureLoudness([s, s], 48000);
    expect(r.integrated).toBe(-Infinity);
    expect(r.samplePeak).toBe(-Infinity);
  });
});

describe('peaks and clipping', () => {
  it('true peak finds the inter-sample peak of a fs/4 sine sampled at 45°', () => {
    // Samples hit ±0.707·A, the continuous waveform reaches A → sample peak -3.01 dBFS, true peak 0 dBTP
    const rate = 48000;
    const s = sine(rate / 4, 1, 2, rate, Math.PI / 4);
    const r = measureLoudness([s, s], rate);
    expect(r.samplePeak).toBeCloseTo(-3.01, 1);
    expect(Math.abs(r.truePeak)).toBeLessThan(0.25);
  });

  it('true peak equals the sample peak for a slow sine', () => {
    const s = sine(100, 0.5, 2, 48000);
    const r = measureLoudness([s, s], 48000);
    expect(r.truePeak - r.samplePeak).toBeLessThan(0.05);
    expect(r.truePeak).toBeGreaterThanOrEqual(r.samplePeak);
  });

  it('counts runs of ≥ 3 full-scale samples as clipping events', () => {
    const s = new Float32Array(48000).fill(0.1);
    s.fill(1, 1000, 1010); // one event
    s.fill(-1, 5000, 5002); // only 2 samples → no event
    s.fill(1, 9000, 9003); // one event
    expect(measureLoudness([s], 48000).clipEvents).toBe(2);
  });

  it('RMS of a full-scale sine is -3.01 dBFS', () => {
    const s = sine(997, 1, 5, 48000);
    expect(measureLoudness([s, s], 48000).rms).toBeCloseTo(-3.01, 1);
  });
});
