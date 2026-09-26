import type { PcmData } from './pcm';

/** Checks for the AIFF/AIFF-C signature. */
export function isAiff(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const b = new Uint8Array(buf, 0, 12);
  const s = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  return s(0) === 'FORM' && (s(8) === 'AIFF' || s(8) === 'AIFC');
}

/** 80-bit IEEE 754 extended precision (big endian) → number */
function readExtended(v: DataView, o: number): number {
  const expon = v.getUint16(o) & 0x7fff;
  const sign = v.getUint8(o) & 0x80 ? -1 : 1;
  const hi = v.getUint32(o + 2);
  const lo = v.getUint32(o + 6);
  if (expon === 0 && hi === 0 && lo === 0) return 0;
  return sign * (hi * 2 ** (expon - 16383 - 31) + lo * 2 ** (expon - 16383 - 63));
}

const SUPPORTED = ['none', 'twos', 'sowt', 'in24', 'in32', 'fl32', 'fl64', 'raw '];

/**
 * Decodes uncompressed AIFF / AIFF-C (NONE, twos, sowt, in24, in32, fl32, fl64).
 * Chrome and Firefox cannot decode AIFF natively – Safari can.
 */
export function decodeAiff(buf: ArrayBuffer): PcmData {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  const isAifc = tag(8) === 'AIFC';
  let nCh = 0, frames = 0, bits = 0, rate = 0;
  let comp = 'NONE';
  let ssnd = -1;
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4);
    const body = o + 8;
    if (id === 'COMM') {
      nCh = v.getInt16(body);
      frames = v.getUint32(body + 2);
      bits = v.getInt16(body + 6);
      rate = readExtended(v, body + 8);
      if (isAifc && size >= 22) comp = tag(body + 18);
    } else if (id === 'SSND') {
      ssnd = body + 8 + v.getUint32(body);
    }
    o = body + size + (size & 1);
  }
  if (ssnd < 0 || nCh < 1 || !(rate > 0) || bits < 1 || bits > 64) throw new Error('Invalid AIFF file');

  const c = comp.toLowerCase();
  if (!SUPPORTED.includes(c)) throw new Error(`Unsupported AIFF-C compression "${comp}"`);
  const float = c === 'fl32' || c === 'fl64';
  const little = c === 'sowt';
  if (c === 'fl32' || c === 'in32') bits = 32;
  if (c === 'fl64') bits = 64;
  if (c === 'in24') bits = 24;
  const bps = Math.ceil(bits / 8);
  frames = Math.min(frames, Math.floor((buf.byteLength - ssnd) / (bps * nCh)));
  const channels = Array.from({ length: nCh }, () => new Float32Array(frames));
  const scale = 1 / 2 ** (bps * 8 - 1);

  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < nCh; ch++) {
      const p = ssnd + (i * nCh + ch) * bps;
      let s: number;
      if (float) s = bps === 8 ? v.getFloat64(p) : v.getFloat32(p);
      else if (bps === 1) s = v.getInt8(p) * scale;
      else if (bps === 2) s = v.getInt16(p, little) * scale;
      else if (bps === 3) {
        s = little
          ? (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) * scale
          : ((v.getInt8(p) << 16) | (v.getUint8(p + 1) << 8) | v.getUint8(p + 2)) * scale;
      } else s = v.getInt32(p, little) * scale;
      channels[ch][i] = s;
    }
  }
  return { channels, sampleRate: Math.round(rate), bitsPerSample: bits };
}
