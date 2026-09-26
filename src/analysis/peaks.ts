/**
 * Waveform overview: per bucket minimum, maximum (over all channels) and RMS.
 * Layout: [min0, max0, rms0, min1, max1, rms1, ...]
 */
export function computePeaks(channels: Float32Array[], buckets: number): Float32Array {
  const len = channels[0]?.length ?? 0;
  const out = new Float32Array(buckets * 3);
  const span = len / buckets;
  const nCh = channels.length;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * span);
    const end = Math.min(len, Math.max(start + 1, Math.floor((b + 1) * span)));
    let mn = 0, mx = 0, sq = 0;
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const s = ch[i];
        if (s < mn) mn = s;
        if (s > mx) mx = s;
        sq += s * s;
      }
    }
    const n = (end - start) * nCh;
    out[b * 3] = mn;
    out[b * 3 + 1] = mx;
    out[b * 3 + 2] = n > 0 ? Math.sqrt(sq / n) : 0;
  }
  return out;
}
