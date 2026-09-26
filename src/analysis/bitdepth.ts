/**
 * Determines the bit depth actually used by PCM material: a 24-bit file padded
 * from 16-bit material only contains integer values when scaled by 2^15.
 * Returns undefined for digital silence and 32 for float/lossy material.
 */
export function effectiveBitDepth(channels: Float32Array[]): number | undefined {
  const candidates = [8, 16, 20, 24];
  const passes = candidates.map(() => true);
  let nonZero = false;
  const CHUNK = 4096;
  const MAX_CHUNKS = 256;
  for (const ch of channels) {
    const len = ch.length;
    const chunks = Math.min(MAX_CHUNKS, Math.max(1, Math.floor(len / CHUNK)));
    const stride = Math.floor(len / chunks);
    for (let c = 0; c < chunks; c++) {
      const start = c * stride;
      const end = Math.min(len, start + CHUNK);
      for (let i = start; i < end; i++) {
        const s = ch[i];
        if (s === 0) continue;
        nonZero = true;
        for (let k = 0; k < candidates.length; k++) {
          if (!passes[k]) continue;
          const v = s * (1 << (candidates[k] - 1));
          if (v !== Math.round(v)) passes[k] = false;
        }
      }
      if (!passes[passes.length - 1]) return nonZero ? 32 : undefined;
    }
  }
  if (!nonZero) return undefined;
  const idx = passes.indexOf(true);
  return idx === -1 ? 32 : candidates[idx];
}
