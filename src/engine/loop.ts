/**
 * Renders one channel of a loop region [s0, s0 + len) into `out` (length len).
 * The last `fadeLen` samples are equal-power crossfaded into the samples that
 * precede the loop start, so that out[len - 1] flows continuously into out[0]
 * when the buffer is played in a loop. Samples outside `x` are treated as silence.
 */
export function renderLoopChannel(x: Float32Array, s0: number, len: number, fadeLen: number, out: Float32Array): void {
  const at = (k: number) => (k >= 0 && k < x.length ? x[k] : 0);
  out.fill(0);
  const from = Math.max(0, s0);
  const to = Math.min(x.length, s0 + len);
  if (to > from) out.set(x.subarray(from, to), from - s0);
  const f = Math.max(0, Math.min(fadeLen, len));
  for (let j = 0; j < f; j++) {
    const i = len - f + j;
    const w = ((j + 0.5) / f) * (Math.PI / 2);
    out[i] = at(s0 + i) * Math.cos(w) + at(s0 - f + j) * Math.sin(w);
  }
}
