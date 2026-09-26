import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWavFloat32 } from './pcm';
import { decodeAiff, isAiff } from './aiff';
import { renderLoopChannel } from './loop';
import { noise, sine } from '../analysis/testsignals';

/** Builds a minimal AIFF file (big-endian PCM). */
function makeAiff(channels: number[][], rate: number, bits: 16 | 24): ArrayBuffer {
  const frames = channels[0].length;
  const bps = bits / 8;
  const dataLen = frames * channels.length * bps;
  const buf = new ArrayBuffer(12 + 26 + 16 + dataLen);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'FORM');
  v.setUint32(4, buf.byteLength - 8);
  str(8, 'AIFF');
  str(12, 'COMM');
  v.setUint32(16, 18);
  v.setInt16(20, channels.length);
  v.setUint32(22, frames);
  v.setInt16(26, bits);
  // 80-bit extended sample rate
  const exp = Math.floor(Math.log2(rate));
  v.setUint16(28, exp + 16383);
  v.setUint32(30, Math.floor((rate / 2 ** exp) * 2 ** 31) >>> 0);
  v.setUint32(34, 0);
  str(38, 'SSND');
  v.setUint32(42, 8 + dataLen);
  let o = 54;
  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      const q = Math.round(ch[i] * 2 ** (bits - 1));
      if (bits === 16) v.setInt16(o, q);
      else {
        v.setInt8(o, q >> 16);
        v.setUint8(o + 1, (q >> 8) & 0xff);
        v.setUint8(o + 2, q & 0xff);
      }
      o += bps;
    }
  }
  return buf;
}

describe('WAV', () => {
  it('round-trips float32 PCM exactly', () => {
    const l = noise(1000, 0.9, 1);
    const r = noise(1000, 0.9, 2);
    const pcm = decodeWav(encodeWavFloat32({ channels: [l, r], sampleRate: 88200, bitsPerSample: 32 }));
    expect(pcm.sampleRate).toBe(88200);
    expect(pcm.channels[0]).toEqual(l);
    expect(pcm.channels[1]).toEqual(r);
  });

  it('rejects garbage and unsupported formats', () => {
    expect(() => decodeWav(new ArrayBuffer(64))).toThrow();
    const wav = encodeWavFloat32({ channels: [new Float32Array(10)], sampleRate: 44100, bitsPerSample: 32 });
    new DataView(wav).setUint16(34, 12, true); // 12-bit float is invalid
    expect(() => decodeWav(wav)).toThrow();
  });
});

describe('AIFF', () => {
  it('decodes 16- and 24-bit big-endian PCM and the extended-precision sample rate', () => {
    for (const bits of [16, 24] as const) {
      const ch = [0, 0.5, -0.5, 0.25, -1];
      const buf = makeAiff([ch, ch.map((x) => -x)], 44100, bits);
      expect(isAiff(buf)).toBe(true);
      const pcm = decodeAiff(buf);
      expect(pcm.sampleRate).toBe(44100);
      expect(pcm.bitsPerSample).toBe(bits);
      expect(Array.from(pcm.channels[0])).toEqual(ch);
      expect(pcm.channels[1][1]).toBe(-0.5);
    }
  });

  it('rejects truncated files', () => {
    const buf = makeAiff([[0, 0.5]], 48000, 16).slice(0, 30);
    expect(() => decodeAiff(buf)).toThrow();
  });
});

describe('renderLoopChannel', () => {
  it('makes the wrap-around continuous (no click)', () => {
    const rate = 48000;
    // 997 Hz: the loop length is not a whole number of periods → a hard splice would click
    const x = sine(997, 0.8, 2, rate);
    const s0 = 12345;
    const len = 30001;
    const fade = Math.round(0.012 * rate);
    const out = new Float32Array(len);
    renderLoopChannel(x, s0, len, fade, out);

    const maxStep = 2 * Math.PI * (997 / rate) * 0.8 * 1.05; // largest sample-to-sample step of the sine
    expect(Math.abs(out[0] - out[len - 1])).toBeLessThan(maxStep);
    // Hard splice for comparison: a clearly larger jump
    expect(Math.abs(x[s0] - x[s0 + len - 1])).toBeGreaterThan(maxStep);
    // Body of the loop is untouched
    expect(out[100]).toBe(x[s0 + 100]);
  });

  it('pads with silence outside the source', () => {
    const x = new Float32Array([1, 1, 1, 1]);
    const out = new Float32Array(6);
    renderLoopChannel(x, -2, 6, 0, out);
    expect(Array.from(out)).toEqual([0, 0, 1, 1, 1, 1]);
  });
});
