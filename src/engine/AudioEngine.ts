/**
 * Audio engine: plays two AudioBuffers sample-accurately in sync and switches
 * between them with a short gain ramp. Both sources always run simultaneously;
 * switching only changes their gain, so the playhead never moves.
 *
 *   Source ─→ Fade ─→ Comp (level match) ─→ Analyser ─→ Switch ─┐
 *   Source ─→ Fade ─→ Comp (level match) ─→ Analyser ─→ Switch ─┴→ Master ─→ Output
 *
 * Loops use a pre-rendered loop buffer whose tail is equal-power crossfaded into
 * the audio just before the loop start, so the wrap-around is click-free while
 * still being scheduled sample-accurately on the audio thread.
 */

import { renderLoopChannel } from './loop';
import { ParamSchedule } from './param';

export type Slot = 'A' | 'B';
export const SLOTS: readonly Slot[] = ['A', 'B'];

export interface LoopRegion { start: number; end: number }
export type OutputMode = 'direct' | 'element';

interface Playing {
  src: AudioBufferSourceNode;
  fade: GainNode;
  gain: ParamSchedule;
}

interface Voice {
  buffer: AudioBuffer | null;
  comp: ParamSchedule;
  compNode: GainNode;
  analyser: AnalyserNode;
  sw: ParamSchedule;
  nodes: Playing[];
  ended: boolean;
  loopCache: { key: string; buffer: AudioBuffer } | null;
}

type EngineEvent = 'state' | 'ended' | 'loop';

/** Scheduling lookahead so both sources start in the same render quantum. */
const LOOKAHEAD = 0.02;
/** Fade for start, stop and jumps (prevents clicks). */
const SEEK_FADE = 0.006;
/** Crossfade length at the loop wrap-around. */
const LOOP_XFADE = 0.012;
export const MIN_LOOP = 0.05;
/** Longer loops fall back to native looping to save memory. */
const MAX_RENDERED_LOOP = 180;

export class AudioEngine extends EventTarget {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private readonly masterGain: ParamSchedule;
  readonly meterL: AnalyserNode;
  readonly meterR: AnalyserNode;
  private readonly voices: Record<Slot, Voice>;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private outputMode: OutputMode = 'direct';

  private _playing = false;
  private starting = false;
  private startPos = 0;
  private startCtxTime = 0;
  private pausedPos = 0;
  private gen = 0;
  private _active: Slot = 'A';
  private _offsetB = 0;
  private _loop: LoopRegion | null = null;
  private _loopEnabled = false;
  crossfade = 0.008;

  /** Called in play() in element mode (the media element must start inside the user gesture). */
  onNeedElementPlay: (() => void) | null = null;

  constructor(ctx?: AudioContext) {
    super();
    this.ctx = ctx ?? createAudioContext();
    const c = this.ctx;
    this.master = c.createGain();
    this.masterGain = new ParamSchedule(this.master.gain, 1);
    this.master.connect(c.destination);

    const splitter = c.createChannelSplitter(2);
    this.meterL = c.createAnalyser();
    this.meterR = c.createAnalyser();
    this.meterL.fftSize = this.meterR.fftSize = 2048;
    this.master.connect(splitter);
    splitter.connect(this.meterL, 0);
    splitter.connect(this.meterR, 1);

    const makeVoice = (slot: Slot): Voice => {
      const comp = c.createGain();
      const analyser = c.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.82;
      analyser.minDecibels = -130;
      analyser.maxDecibels = 0;
      const sw = c.createGain();
      comp.connect(analyser).connect(sw).connect(this.master);
      return {
        buffer: null,
        comp: new ParamSchedule(comp.gain, 1),
        compNode: comp,
        analyser,
        sw: new ParamSchedule(sw.gain, slot === this._active ? 1 : 0),
        nodes: [],
        ended: true,
        loopCache: null,
      };
    };
    this.voices = { A: makeVoice('A'), B: makeVoice('B') };

    c.addEventListener('statechange', () => {
      // iOS may interrupt the context (phone call, route change, …).
      if (this._playing && c.state !== 'running') {
        this.pausedPos = this.position;
        this.stopSources(c.currentTime);
        this._playing = false;
        this.emit('state');
      }
    });
  }

  // ------------------------------------------------------------------ State

  get playing(): boolean { return this._playing; }
  get active(): Slot { return this._active; }
  get offsetB(): number { return this._offsetB; }
  get loop(): LoopRegion | null { return this._loop; }
  get loopEnabled(): boolean { return this._loopEnabled; }
  get sampleRate(): number { return this.ctx.sampleRate; }
  get mode(): OutputMode { return this.outputMode; }

  buffer(slot: Slot): AudioBuffer | null { return this.voices[slot].buffer; }
  analyser(slot: Slot): AnalyserNode { return this.voices[slot].analyser; }

  /** Length of the shared timeline (A's time; B is shifted by offsetB). */
  get duration(): number {
    const a = this.voices.A.buffer?.duration ?? 0;
    const b = this.voices.B.buffer ? this.voices.B.buffer.duration - this._offsetB : 0;
    return Math.max(a, b, 0);
  }

  private get activeLoop(): LoopRegion | null {
    const l = this._loop;
    return this._loopEnabled && l && l.end - l.start >= MIN_LOOP ? l : null;
  }

  /** Current position on the timeline in seconds. */
  get position(): number {
    return this.positionAt(this.ctx.currentTime);
  }

  private positionAt(ctxTime: number): number {
    if (!this._playing) return this.pausedPos;
    let p = this.startPos + Math.max(0, ctxTime - this.startCtxTime);
    const loop = this.activeLoop;
    if (loop && this.startPos < loop.end && p >= loop.end) {
      const len = loop.end - loop.start;
      p = loop.start + ((p - loop.end) % len);
    }
    return Math.min(p, this.duration);
  }

  private emit(type: EngineEvent): void {
    this.dispatchEvent(new Event(type));
  }

  // ------------------------------------------------------------------ Loading

  setBuffer(slot: Slot, buffer: AudioBuffer | null): void {
    const v = this.voices[slot];
    v.loopCache = null;
    if (!this._playing) {
      v.buffer = buffer;
      this.pausedPos = Math.min(this.pausedPos, this.duration);
      if (!this.voices.A.buffer && !this.voices.B.buffer) this.pausedPos = 0;
      this.emit('state');
      return;
    }
    const when = this.ctx.currentTime + LOOKAHEAD / 2;
    const pos = this.positionAt(when);
    this.stopSources(when);
    v.buffer = buffer;
    if (!this.voices.A.buffer && !this.voices.B.buffer) {
      this._playing = false;
      this.pausedPos = 0;
      this.emit('state');
      return;
    }
    this.restartAt(Math.min(pos, this.duration), when);
  }

  // ------------------------------------------------------------------ Transport

  async play(): Promise<void> {
    if (this._playing || this.starting || (!this.voices.A.buffer && !this.voices.B.buffer)) return;
    // resume() must be called synchronously inside the gesture handler (iOS).
    const resumed = this.ctx.state === 'running' ? null : this.ctx.resume();
    if (this.outputMode === 'element') this.onNeedElementPlay?.();
    if (resumed) {
      this.starting = true;
      try {
        await resumed;
      } finally {
        this.starting = false;
      }
    }
    let pos = this.pausedPos;
    if (pos >= this.duration - 0.01) pos = 0;
    const loop = this.activeLoop;
    if (loop && pos >= loop.end) pos = loop.start;
    this.restartAt(pos, this.ctx.currentTime + LOOKAHEAD);
    this._playing = true;
    this.emit('state');
  }

  pause(): void {
    if (!this._playing) return;
    this.pausedPos = this.position;
    this.stopSources(this.ctx.currentTime);
    this._playing = false;
    this.emit('state');
  }

  toggle(): void {
    if (this._playing) this.pause();
    else void this.play();
  }

  seek(t: number): void {
    const target = Math.max(0, Math.min(t, this.duration));
    const loop = this.activeLoop;
    if (loop && target >= loop.end) {
      // Jumping past the loop end disables the loop instead of snapping back.
      this._loopEnabled = false;
      this.emit('loop');
    }
    if (!this._playing) {
      this.pausedPos = target;
      this.emit('state');
      return;
    }
    const when = this.ctx.currentTime + LOOKAHEAD / 2;
    this.stopSources(when);
    this.restartAt(target, when);
  }

  /**
   * Re-schedules the sources after a parameter change without an audible jump:
   * the old sources fade out while new ones fade in at exactly the same position.
   */
  private restartSeamless(): void {
    if (!this._playing) return;
    const when = this.ctx.currentTime + LOOKAHEAD / 2;
    const pos = this.positionAt(when);
    this.stopSources(when);
    this.restartAt(pos, when);
  }

  private restartAt(pos: number, when: number): void {
    const loop = this.activeLoop;
    // The position formula assumes a start inside or before the loop.
    const start = loop && pos >= loop.end ? loop.start : pos;
    this.startSources(start, when);
    this.startPos = start;
    this.startCtxTime = when;
  }

  private createNode(buffer: AudioBuffer, slot: Slot): Playing {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const fade = this.ctx.createGain();
    src.connect(fade).connect(this.voices[slot].compNode);
    return { src, fade, gain: new ParamSchedule(fade.gain, 0) };
  }

  private startSources(pos: number, when: number): void {
    const gen = ++this.gen;
    const loop = this.activeLoop;
    for (const slot of SLOTS) {
      const v = this.voices[slot];
      v.nodes = [];
      v.ended = true;
      if (!v.buffer) continue;
      const off = slot === 'B' ? this._offsetB : 0;
      if (loop) this.scheduleLoop(slot, v, pos, when, loop, off);
      else this.scheduleLinear(slot, v, pos, when, off, gen);
    }
    if (this.voices.A.ended && this.voices.B.ended) {
      // Nothing left to play (position at the end).
      queueMicrotask(() => this.onSourceEnded(gen, 'A'));
    }
  }

  /** Plays the buffer from pos until its end. */
  private scheduleLinear(slot: Slot, v: Voice, pos: number, when: number, off: number, gen: number): void {
    const buffer = v.buffer!;
    let bufPos = pos + off;
    let startAt = when;
    if (bufPos < 0) {
      startAt = when - bufPos;
      bufPos = 0;
    }
    if (bufPos >= buffer.duration) return;
    const n = this.createNode(buffer, slot);
    n.gain.rampTo(1, startAt, SEEK_FADE);
    n.src.onended = () => this.onSourceEnded(gen, slot);
    n.src.start(startAt, bufPos);
    v.nodes.push(n);
    v.ended = false;
  }

  /** Plays up to the loop start from the original buffer, then the crossfaded loop buffer forever. */
  private scheduleLoop(slot: Slot, v: Voice, pos: number, when: number, loop: LoopRegion, off: number): void {
    const loopBuf = this.loopBuffer(v, loop, off);
    if (!loopBuf) {
      // Very long loop: native looping on the original buffer (no wrap crossfade).
      const n = this.createNode(v.buffer!, slot);
      n.src.loop = true;
      n.src.loopStart = Math.max(0, loop.start + off);
      n.src.loopEnd = Math.max(n.src.loopStart + MIN_LOOP, loop.end + off);
      const bufPos = Math.max(0, pos + off);
      n.gain.rampTo(1, when, SEEK_FADE);
      n.src.start(when, bufPos);
      v.nodes.push(n);
      v.ended = false;
      return;
    }

    if (pos >= loop.start) {
      const n = this.createNode(loopBuf, slot);
      n.src.loop = true;
      n.gain.rampTo(1, when, SEEK_FADE);
      n.src.start(when, pos - loop.start);
      v.nodes.push(n);
      v.ended = false;
      return;
    }

    // Lead-in from the original buffer, then a hand-over to the loop buffer at the loop start.
    // Both play identical samples during the hand-over, so the linear crossfade is transparent.
    const handover = when + (loop.start - pos);
    let bufPos = pos + off;
    let startAt = when;
    if (bufPos < 0) {
      startAt = when - bufPos;
      bufPos = 0;
    }
    if (startAt < handover) {
      const lead = this.createNode(v.buffer!, slot);
      lead.gain.rampTo(1, startAt, SEEK_FADE);
      lead.gain.rampTo(0, handover, SEEK_FADE);
      lead.src.start(startAt, bufPos);
      lead.src.stop(handover + SEEK_FADE);
      v.nodes.push(lead);
    }
    const n = this.createNode(loopBuf, slot);
    n.src.loop = true;
    n.gain.rampTo(1, handover, SEEK_FADE);
    n.src.start(handover, 0);
    v.nodes.push(n);
    v.ended = false;
  }

  /**
   * Builds (and caches) the loop region as its own buffer. The last LOOP_XFADE seconds
   * are equal-power crossfaded into the samples preceding the loop start, so the
   * wrap from the last to the first sample is continuous.
   */
  private loopBuffer(v: Voice, loop: LoopRegion, off: number): AudioBuffer | null {
    const src = v.buffer!;
    const sr = src.sampleRate;
    const s0 = Math.round((loop.start + off) * sr);
    const len = Math.round((loop.end - loop.start) * sr);
    if (len < 2 || loop.end - loop.start > MAX_RENDERED_LOOP) return null;
    const key = `${s0}:${len}`;
    if (v.loopCache?.key === key) return v.loopCache.buffer;

    const out = this.ctx.createBuffer(src.numberOfChannels, len, sr);
    const fadeLen = Math.min(Math.round(LOOP_XFADE * sr), Math.floor(len / 4));
    for (let c = 0; c < src.numberOfChannels; c++) {
      renderLoopChannel(src.getChannelData(c), s0, len, fadeLen, out.getChannelData(c));
    }
    v.loopCache = { key, buffer: out };
    return out;
  }

  private stopSources(when: number): void {
    for (const slot of SLOTS) {
      const v = this.voices[slot];
      for (const { src, fade, gain } of v.nodes) {
        gain.rampTo(0, when, SEEK_FADE);
        try {
          src.stop(when + SEEK_FADE);
        } catch {
          /* already stopped */
        }
        src.onended = () => {
          src.disconnect();
          fade.disconnect();
        };
      }
      v.nodes = [];
    }
  }

  private onSourceEnded(gen: number, slot: Slot): void {
    if (gen !== this.gen || !this._playing) return;
    this.voices[slot].ended = true;
    if (!this.voices.A.ended || !this.voices.B.ended) return;
    this._playing = false;
    this.pausedPos = 0;
    this.gen++;
    this.emit('state');
    this.emit('ended');
  }

  // ------------------------------------------------------------------ A/B

  /** Crossfades to slot (linear – constant amplitude for correlated signals). */
  setActive(slot: Slot): void {
    this._active = slot;
    const t = this.ctx.currentTime;
    for (const s of SLOTS) this.voices[s].sw.rampTo(s === slot ? 1 : 0, t, this.crossfade);
    this.emit('state');
  }

  /** Level-match gain per slot in dB. */
  setCompensation(slot: Slot, db: number): void {
    this.voices[slot].comp.rampTo(Math.pow(10, db / 20), this.ctx.currentTime, 0.03);
  }

  setVolume(linear: number): void {
    this.masterGain.rampTo(linear, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------------ Offset & loop

  setOffsetB(seconds: number): void {
    if (seconds === this._offsetB) return;
    const when = this.ctx.currentTime + LOOKAHEAD / 2;
    const pos = this.positionAt(when);
    this._offsetB = seconds;
    this.voices.B.loopCache = null;
    if (this._playing) {
      this.stopSources(when);
      this.restartAt(Math.min(pos, this.duration), when);
    } else {
      this.pausedPos = Math.min(this.pausedPos, this.duration);
    }
  }

  setLoop(region: LoopRegion | null): void {
    this.changeLoop(() => {
      this._loop = region ? { start: Math.min(region.start, region.end), end: Math.max(region.start, region.end) } : null;
      if (!this._loop) this._loopEnabled = false;
    });
  }

  setLoopEnabled(on: boolean): void {
    this.changeLoop(() => {
      this._loopEnabled = on && !!this._loop;
    });
  }

  /** Applies a loop change; while playing, the position right before the change is continued seamlessly. */
  private changeLoop(mutate: () => void): void {
    if (!this._playing) {
      mutate();
      this.emit('loop');
      return;
    }
    const when = this.ctx.currentTime + LOOKAHEAD / 2;
    const pos = this.positionAt(when);
    mutate();
    this.stopSources(when);
    this.restartAt(pos, when);
    this.emit('loop');
  }

  // ------------------------------------------------------------------ Output

  /**
   * 'direct':  master → AudioContext.destination
   * 'element': master → MediaStream → <audio> (AirPlay picker / background playback)
   */
  setOutputMode(mode: OutputMode): MediaStream | null {
    this.outputMode = mode;
    const safeDisconnect = (node: AudioNode) => {
      try {
        this.master.disconnect(node);
      } catch {
        /* was not connected */
      }
    };
    safeDisconnect(this.ctx.destination);
    if (this.streamDest) safeDisconnect(this.streamDest);
    if (mode === 'element') {
      this.streamDest ??= this.ctx.createMediaStreamDestination();
      this.master.connect(this.streamDest);
      return this.streamDest.stream;
    }
    this.master.connect(this.ctx.destination);
    return null;
  }

  /** Stops playback and releases the audio context. */
  async dispose(): Promise<void> {
    this.stopSources(this.ctx.currentTime);
    this._playing = false;
    this.gen++;
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}

export function createAudioContext(): AudioContext {
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx({ latencyHint: 'interactive' });
}
