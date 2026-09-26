/** Decoded PCM at the native sample rate (for analysis and WAV re-wrapping). */
export interface PcmData {
  channels: Float32Array[];
  sampleRate: number;
  bitsPerSample: number;
}

/** Writes float32 PCM as an IEEE-float WAV (so decodeAudioData can resample it in high quality). */
export function encodeWavFloat32(pcm: PcmData): ArrayBuffer {
  const nCh = pcm.channels.length;
  const frames = pcm.channels[0]?.length ?? 0;
  const dataBytes = frames * nCh * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); // IEEE Float
  v.setUint16(22, nCh, true);
  v.setUint32(24, pcm.sampleRate, true);
  v.setUint32(28, pcm.sampleRate * nCh * 4, true);
  v.setUint16(32, nCh * 4, true);
  v.setUint16(34, 32, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  const out = new Float32Array(buf, 44, frames * nCh);
  for (let c = 0; c < nCh; c++) {
    const ch = pcm.channels[c];
    for (let i = 0, j = c; i < frames; i++, j += nCh) out[j] = ch[i];
  }
  return buf;
}

/** Minimal WAV parser (PCM 8/16/24/32, float 32/64, WAVE_FORMAT_EXTENSIBLE). */
export function decodeWav(buf: ArrayBuffer): PcmData {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let fmt = 0, nCh = 0, rate = 0, bits = 0;
  let dataOff = -1, dataLen = 0;
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    let size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      fmt = v.getUint16(body, true);
      nCh = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
      if (fmt === 0xfffe && size >= 40) fmt = v.getUint16(body + 24, true);
    } else if (id === 'data') {
      dataOff = body;
      if (size === 0 || size === 0xffffffff || body + size > buf.byteLength) size = buf.byteLength - body;
      dataLen = size;
      break;
    }
    o = body + size + (size & 1);
  }
  if (dataOff < 0 || nCh < 1) throw new Error('WAV file without audio data');
  const validPcm = fmt === 1 && [8, 16, 24, 32].includes(bits);
  const validFloat = fmt === 3 && (bits === 32 || bits === 64);
  if (!validPcm && !validFloat) throw new Error(`Unsupported WAV format (${fmt}, ${bits} bit)`);
  const bps = bits / 8;
  const frames = Math.floor(dataLen / (bps * nCh));
  const channels = Array.from({ length: nCh }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const p = dataOff + (i * nCh + c) * bps;
      let s: number;
      if (fmt === 3) s = bits === 64 ? v.getFloat64(p, true) : v.getFloat32(p, true);
      else if (bits === 8) s = (v.getUint8(p) - 128) / 128;
      else if (bits === 16) s = v.getInt16(p, true) / 32768;
      else if (bits === 24) s = (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 8388608;
      else s = v.getInt32(p, true) / 2147483648;
      channels[c][i] = s;
    }
  }
  return { channels, sampleRate: rate, bitsPerSample: bits };
}
