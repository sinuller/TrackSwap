/** 256-step "inferno"-like colour map as an RGBA lookup table (Uint32, little-endian ABGR). */
const STOPS: [number, number, number, number][] = [
  [0.0, 8, 9, 14],
  [0.12, 22, 11, 57],
  [0.25, 66, 10, 104],
  [0.38, 106, 23, 110],
  [0.5, 147, 38, 103],
  [0.62, 188, 55, 84],
  [0.74, 221, 81, 58],
  [0.84, 243, 120, 25],
  [0.93, 252, 170, 18],
  [1.0, 252, 240, 170],
];

export const INFERNO: Uint32Array = (() => {
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < STOPS.length - 2 && t > STOPS[j + 1][0]) j++;
    const [t0, r0, g0, b0] = STOPS[j];
    const [t1, r1, g1, b1] = STOPS[j + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const r = Math.round(r0 + (r1 - r0) * f);
    const g = Math.round(g0 + (g1 - g0) * f);
    const b = Math.round(b0 + (b1 - b0) * f);
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return lut;
})();
