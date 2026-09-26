/**
 * Renders the real AudioEngine offline (node-web-audio-api) and checks the output
 * sample by sample: sync between A and B, seamless switching, click-free loops.
 */
import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from './AudioEngine';

const RATE = 48000;
/** Engine start lookahead (see AudioEngine) */
const START = 0.02;

type Offline = OfflineAudioContext & { resumeRendering: () => Promise<void> };

function makeContext(seconds: number): AudioContext {
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE) as unknown as Offline;
  // The engine resumes a suspended context before playing; offline contexts only start on render.
  ctx.resumeRendering = OfflineAudioContext.prototype.resume.bind(ctx);
  (ctx as unknown as { resume: () => Promise<void> }).resume = async () => {};
  return ctx as unknown as AudioContext;
}

function bufferFrom(ctx: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(2, samples.length, RATE);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 1);
  return buf;
}

const sineAt = (freq: number, amp: number) => (t: number) => amp * Math.sin(2 * Math.PI * freq * t);

function signal(fn: (t: number) => number, seconds: number, leadingSilence = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE) + leadingSilence);
  for (let i = 0; i < out.length - leadingSilence; i++) out[i + leadingSilence] = fn(i / RATE);
  return out;
}

async function render(ctx: AudioContext): Promise<Float32Array> {
  const rendered = await (ctx as unknown as OfflineAudioContext).startRendering();
  return rendered.getChannelData(0);
}

describe('AudioEngine (offline render)', () => {
  it('keeps A and B sample-aligned: switching between identical content is seamless (incl. offset correction)', async () => {
    const ctx = makeContext(2.5);
    const engine = new AudioEngine(ctx);
    const wave = sineAt(440, 0.5);
    const delay = 1234; // B starts 1234 samples later in its file (e.g. encoder delay)
    engine.setBuffer('A', bufferFrom(ctx, signal(wave, 3)));
    engine.setBuffer('B', bufferFrom(ctx, signal(wave, 3, delay)));
    engine.setOffsetB(delay / RATE);
    await engine.play();
    const offline = ctx as unknown as Offline;
    void offline.suspend(1.0).then(() => {
      engine.setActive('B');
      void offline.resumeRendering();
    });
    const out = await render(ctx);

    let maxErr = 0;
    for (let i = Math.round(0.1 * RATE); i < Math.round(2.4 * RATE); i++) {
      maxErr = Math.max(maxErr, Math.abs(out[i] - wave(i / RATE - START)));
    }
    expect(maxErr).toBeLessThan(1e-3);
  });

  it('loops without a click and continues exactly at the loop start', async () => {
    const ctx = makeContext(2.5);
    const engine = new AudioEngine(ctx);
    const amp = 0.8;
    const wave = sineAt(997, amp);
    const x = signal(wave, 3);
    engine.setBuffer('A', bufferFrom(ctx, x));
    const loop = { start: 0.5, end: 0.8113 }; // not a whole number of periods
    engine.setLoop(loop);
    engine.setLoopEnabled(true);
    engine.seek(0.3); // start before the loop → lead-in, hand-over at the loop start
    await engine.play();
    const out = await render(ctx);

    // 1) No discontinuities anywhere after the initial fade-in
    const maxStep = 2 * Math.PI * (997 / RATE) * amp;
    let worst = 0;
    for (let i = Math.round((START + 0.01) * RATE); i < out.length - 1; i++) worst = Math.max(worst, Math.abs(out[i + 1] - out[i]));
    expect(worst).toBeLessThan(1.5 * maxStep);

    // 2) Content: lead-in plays 0.3 → 0.5 exactly, then the loop repeats from 0.5.
    //    The loop length is rounded to whole samples (identically for A and B → no drift).
    const s0 = Math.round(loop.start * RATE);
    const lenS = Math.round((loop.end - loop.start) * RATE);
    const fadeS = Math.round(0.013 * RATE);
    const startS = Math.round(START * RATE);
    let maxErr = 0;
    for (let i = Math.round(0.05 * RATE); i < out.length; i++) {
      const pos = Math.round(0.3 * RATE) + (i - startS);
      const p = pos < s0 + lenS ? pos : s0 + ((pos - s0 - lenS) % lenS);
      if (p >= s0 + lenS - fadeS) continue; // wrap crossfade region
      maxErr = Math.max(maxErr, Math.abs(out[i] - x[p]));
    }
    expect(maxErr).toBeLessThan(1e-3);
  });

  it('crossfades over the full crossfade time even long after the previous switch', async () => {
    const ctx = makeContext(1.6);
    const engine = new AudioEngine(ctx);
    engine.crossfade = 0.008;
    const wave = sineAt(200, 0.5);
    engine.setBuffer('A', bufferFrom(ctx, signal(wave, 2)));
    engine.setBuffer('B', bufferFrom(ctx, new Float32Array(2 * RATE))); // silence
    engine.setActive('A'); // first switch at t = 0
    await engine.play();
    const offline = ctx as unknown as Offline;
    void offline.suspend(1.2).then(() => {
      engine.setActive('B'); // second switch 1.2 s later
      void offline.resumeRendering();
    });
    const out = await render(ctx);
    // Gain of A over time = projection of the output onto the reference signal
    const gainAt = (t: number) => {
      let num = 0, den = 0;
      for (let i = Math.round((t - 0.0005) * RATE); i < Math.round((t + 0.0005) * RATE); i++) {
        const r = wave(i / RATE - START);
        num += out[i] * r;
        den += r * r;
      }
      return num / den;
    };
    expect(gainAt(1.0)).toBeCloseTo(1, 2);
    const mid = gainAt(1.2 + 0.004); // halfway through the 8 ms crossfade
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(gainAt(1.3)).toBeCloseTo(0, 2);
  });

  // node-web-audio-api on Linux does not process source nodes that are created while an
  // OfflineAudioContext is suspended, so this scenario can only be rendered on Windows/macOS.
  it.skipIf(process.platform === 'linux')('re-schedules seamlessly when the loop changes during playback', async () => {
    const ctx = makeContext(1.5);
    const engine = new AudioEngine(ctx);
    const wave = sineAt(523, 0.6);
    engine.setBuffer('A', bufferFrom(ctx, signal(wave, 3)));
    await engine.play();
    const offline = ctx as unknown as Offline;
    let suspendedAt = -1;
    void offline.suspend(0.5).then(() => {
      suspendedAt = ctx.currentTime;
      // Region ahead of the playhead: playback must continue without any jump
      engine.setLoop({ start: 1.2, end: 1.4 });
      engine.setLoopEnabled(true);
      void offline.resumeRendering();
    });
    const out = await render(ctx);
    let maxErr = 0;
    let worst = 0;
    // compare up to the first loop wrap (timeline 1.4 s)
    for (let i = Math.round(0.1 * RATE); i < Math.round(1.4 * RATE); i++) {
      const e = Math.abs(out[i] - wave(i / RATE - START));
      if (e > maxErr) {
        maxErr = e;
        worst = i;
      }
    }
    expect(maxErr, `worst at ${(worst / RATE).toFixed(5)} s (suspended at ${suspendedAt})`).toBeLessThan(1e-3);
  });

  it('applies level matching as an exact gain', async () => {
    const ctx = makeContext(1);
    const engine = new AudioEngine(ctx);
    engine.setBuffer('A', bufferFrom(ctx, signal(sineAt(1000, 0.5), 2)));
    engine.setCompensation('A', -6.0206); // exactly half the amplitude
    await engine.play();
    const out = await render(ctx);
    let peak = 0;
    for (let i = Math.round(0.3 * RATE); i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    expect(peak).toBeCloseTo(0.25, 3);
  });
});
