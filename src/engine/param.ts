interface Segment { t0: number; t1: number; from: number; to: number }

/**
 * Wraps an AudioParam and keeps track of the linear ramps scheduled on it, so
 * every new ramp starts exactly at the value the parameter will have at that time.
 *
 * Why: per the Web Audio spec a linearRamp starts at the time of the *previous*
 * automation event. Without an explicit start point, a crossfade scheduled long
 * after the last one would jump almost instantly to its target (= audible click).
 */
export class ParamSchedule {
  private segments: Segment[] = [];
  private base: number;

  constructor(readonly param: AudioParam, initial: number) {
    param.value = initial;
    this.base = initial;
  }

  /** Value the parameter has (or will have) at context time t. */
  valueAt(t: number): number {
    let v = this.base;
    for (const s of this.segments) {
      if (t < s.t0) break;
      v = t >= s.t1 || s.t1 === s.t0 ? s.to : s.from + ((s.to - s.from) * (t - s.t0)) / (s.t1 - s.t0);
    }
    return v;
  }

  /** Linear ramp from the value at `at` to `target` over `duration` seconds (0 = step). */
  rampTo(target: number, at: number, duration: number): void {
    const from = this.valueAt(at);
    const p = this.param;
    // cancelAndHoldAtTime keeps a ramp that is in progress at `at` intact up to `at`
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at);
    else p.cancelScheduledValues(at);
    p.setValueAtTime(from, at);
    if (duration > 0) p.linearRampToValueAtTime(target, at + duration);
    else p.setValueAtTime(target, at);

    // Update the model: drop cancelled segments, cut one in progress, forget old ones
    this.segments = this.segments
      .filter((s) => s.t0 < at)
      .map((s) => (s.t1 > at ? { ...s, t1: at, to: from } : s));
    while (this.segments.length && this.segments[0].t1 < at - 1) this.base = this.segments.shift()!.to;
    this.segments.push({ t0: at, t1: at + Math.max(0, duration), from, to: target });
  }
}
