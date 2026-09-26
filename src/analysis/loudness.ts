/**
 * Loudness measurement per ITU-R BS.1770-4 / EBU R128 (+ EBU Tech 3342 for LRA),
 * plus sample peak, true peak (4x oversampling), RMS and clipping detection.
 */

export interface LoudnessResult {
  /** Integrated loudness in LUFS (-Infinity for silence) */
  integrated: number;
  /** Loudness Range in LU */
  range: number;
  /** Maximum momentary loudness (400 ms) in LUFS */
  momentaryMax: number;
  /** Maximum short-term loudness (3 s) in LUFS */
  shortTermMax: number;
  /** Sample peak in dBFS */
  samplePeak: number;
  /** True peak in dBTP */
  truePeak: number;
  /** RMS over all channels in dBFS */
  rms: number;
  /** Number of clipping events (≥ 3 consecutive samples at full scale) */
  clipEvents: number;
  /** Peak-to-loudness ratio (true peak − integrated loudness) in LU */
  plr: number;
}

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** K-weighting filter coefficients for any sample rate (derived as in libebur128). */
function kWeighting(fs: number): [Biquad, Biquad] {
  // Stage 1: high shelf (head model)
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: high-pass (RLB)
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [shelf, hp];
}

/** Channel weights per BS.1770 (5.1: L R C LFE Ls Rs). */
function channelWeights(n: number): number[] {
  if (n === 6) return [1, 1, 1, 0, 1.41, 1.41];
  if (n === 5) return [1, 1, 1, 1.41, 1.41];
  return new Array(n).fill(1);
}

const toLufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);
const toDb = (lin: number) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);

export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  const nCh = channels.length;
  const len = channels[0]?.length ?? 0;
  const weights = channelWeights(nCh);
  const [s1, s2] = kWeighting(sampleRate);

  // 100 ms sub-blocks holding the weighted energy (summed over channels)
  const subLen = sampleRate * 0.1;
  const nSub = Math.floor(len / subLen);
  const sub = new Float64Array(nSub);

  let peak = 0;
  let sumSq = 0;
  let clipEvents = 0;

  for (let c = 0; c < nCh; c++) {
    const x = channels[c];
    const w = weights[c];
    // Biquad states (direct form I)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // stage 1
    let u1 = 0, u2 = 0, v1 = 0, v2 = 0; // stage 2
    let subIdx = 0;
    let nextBoundary = subLen;
    let acc = 0;
    let clipRun = 0;
    for (let i = 0; i < len; i++) {
      const s = x[i];
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      sumSq += s * s;
      if (a >= 0.99995) {
        clipRun++;
        if (clipRun === 3) clipEvents++;
      } else clipRun = 0;

      if (w === 0) continue;
      const y = s1.b0 * s + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
      x2 = x1; x1 = s; y2 = y1; y1 = y;
      const v = s2.b0 * y + s2.b1 * u1 + s2.b2 * u2 - s2.a1 * v1 - s2.a2 * v2;
      u2 = u1; u1 = y; v2 = v1; v1 = v;
      acc += v * v;
      if (i + 1 >= nextBoundary) {
        if (subIdx < nSub) sub[subIdx] += (w * acc) / subLen;
        subIdx++;
        acc = 0;
        nextBoundary = (subIdx + 1) * subLen;
      }
    }
  }

  // Momentary blocks: 400 ms, 75 % overlap
  const momentary: number[] = [];
  for (let j = 0; j + 4 <= nSub; j++) momentary.push((sub[j] + sub[j + 1] + sub[j + 2] + sub[j + 3]) / 4);
  // Short-term blocks: 3 s, 100 ms hop
  const shortTerm: number[] = [];
  if (nSub >= 30) {
    let run = 0;
    for (let j = 0; j < 30; j++) run += sub[j];
    shortTerm.push(run / 30);
    for (let j = 30; j < nSub; j++) {
      run += sub[j] - sub[j - 30];
      shortTerm.push(run / 30);
    }
  }

  // Integrated loudness with absolute (-70 LUFS) and relative (-10 LU) gate
  const absGate = Math.pow(10, (-70 + 0.691) / 10);
  const gated1 = momentary.filter((p) => p > absGate);
  let integrated = -Infinity;
  if (gated1.length) {
    const mean1 = gated1.reduce((a, b) => a + b, 0) / gated1.length;
    const relGate = mean1 * Math.pow(10, -10 / 10);
    const gated2 = gated1.filter((p) => p > relGate);
    if (gated2.length) integrated = toLufs(gated2.reduce((a, b) => a + b, 0) / gated2.length);
  }

  // Loudness range (EBU Tech 3342): relative gate -20 LU, 10th–95th percentile
  let range = 0;
  const stGated = shortTerm.filter((p) => p > absGate);
  if (stGated.length) {
    const mean = stGated.reduce((a, b) => a + b, 0) / stGated.length;
    const rel = mean * Math.pow(10, -20 / 10);
    const vals = stGated.filter((p) => p > rel).map(toLufs).sort((a, b) => a - b);
    if (vals.length > 1) {
      const pct = (q: number) => vals[Math.min(vals.length - 1, Math.round(q * (vals.length - 1)))];
      range = pct(0.95) - pct(0.1);
    }
  }

  const truePeakLin = measureTruePeak(channels, peak);
  const truePeak = toDb(truePeakLin);

  return {
    integrated,
    range,
    momentaryMax: momentary.length ? toLufs(Math.max(...momentary)) : -Infinity,
    shortTermMax: shortTerm.length ? toLufs(Math.max(...shortTerm)) : -Infinity,
    samplePeak: toDb(peak),
    truePeak,
    rms: len ? toDb(Math.sqrt(sumSq / (len * nCh))) : -Infinity,
    clipEvents,
    plr: Number.isFinite(integrated) ? truePeak - integrated : 0,
  };
}

// ---------------------------------------------------------------------------
// True peak: 4x oversampling with a polyphase windowed-sinc filter (12 taps per phase)
// ---------------------------------------------------------------------------

const TP_TAPS = 12;
const TP_HALF = TP_TAPS / 2;
let tpPhases: Float64Array[] | null = null;
let tpGainBound = 1;

function buildTruePeakFilter(): Float64Array[] {
  const phases: Float64Array[] = [];
  for (let p = 1; p < 4; p++) {
    const frac = p / 4;
    const h = new Float64Array(TP_TAPS);
    let sum = 0;
    for (let k = 0; k < TP_TAPS; k++) {
      // Tap k corresponds to sample n + (k - TP_HALF + 1); interpolation point is n + frac
      const t = k - TP_HALF + 1 - frac;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      // Blackman window over ±TP_HALF
      const wx = (t + TP_HALF) / (2 * TP_HALF);
      const win = 0.42 - 0.5 * Math.cos(2 * Math.PI * wx) + 0.08 * Math.cos(4 * Math.PI * wx);
      h[k] = sinc * win;
      sum += h[k];
    }
    let abs = 0;
    for (let k = 0; k < TP_TAPS; k++) {
      h[k] /= sum;
      abs += Math.abs(h[k]);
    }
    tpGainBound = Math.max(tpGainBound, abs);
    phases.push(h);
  }
  return phases;
}

function measureTruePeak(channels: Float32Array[], samplePeak: number): number {
  if (!tpPhases) tpPhases = buildTruePeakFilter();
  const phases = tpPhases;
  let tp = samplePeak;
  const BLOCK = 64;
  for (const x of channels) {
    const len = x.length;
    for (let start = 0; start < len; start += BLOCK) {
      // Skip blocks whose neighbourhood cannot exceed the current true peak
      const lo = Math.max(0, start - TP_HALF);
      const hi = Math.min(len, start + BLOCK + TP_HALF);
      let m = 0;
      for (let i = lo; i < hi; i++) {
        const a = x[i] < 0 ? -x[i] : x[i];
        if (a > m) m = a;
      }
      if (m * tpGainBound <= tp) continue;
      const end = Math.min(len - TP_HALF, start + BLOCK);
      for (let n = Math.max(TP_HALF - 1, start); n < end; n++) {
        const base = n - TP_HALF + 1;
        for (let p = 0; p < 3; p++) {
          const h = phases[p];
          let y = 0;
          for (let k = 0; k < TP_TAPS; k++) y += h[k] * x[base + k];
          if (y < 0) y = -y;
          if (y > tp) tp = y;
        }
      }
    }
  }
  return tp;
}
