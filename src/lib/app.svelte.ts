import { AudioEngine, createAudioContext, SLOTS, type LoopRegion, type OutputMode, type Slot } from '../engine/AudioEngine';
import { decodeAudioFile, NeedsFfmpegError, type DecoderKind } from '../engine/decode';
import { readMetadata, type TrackMeta } from '../analysis/metadata';
import { alignTracks, analyzeChannels } from '../analysis/client';
import type { AlignResult, AnalysisResult } from '../analysis/types';
import { MediaBridge } from '../platform/media';
import { isAppleWebKit } from '../platform/device';
import { fmtRate, fmtSigned } from './format';
import { t, type MessageKey } from './i18n.svelte';

export type Mode = 'compare' | 'blind' | 'abx';
export type View = 'wave' | 'spectrogram' | 'spectrum';
export type Status = 'empty' | 'loading' | 'ready' | 'error' | 'needs-ffmpeg';
export type BlindKey = 'X' | 'Y';
export type AbxKey = 'A' | 'B' | 'X';

export const AUDIO_ACCEPT =
  'audio/*,.mp3,.wav,.flac,.aac,.m4a,.mp4,.ogg,.oga,.opus,.aif,.aiff,.aifc,.alac,.wma,.ape,.wv,.dsf,.dff,.webm,.caf,.mka';

const PEAK_BUCKETS = 4096;
const SPEC_COLUMNS = 1600;
const ALIGN_SECONDS = 60;
const LONG_TRACK_SECONDS = 15 * 60;

export class TrackState {
  readonly slot: Slot;
  file = $state.raw<File | null>(null);
  meta = $state.raw<TrackMeta | null>(null);
  status = $state<Status>('empty');
  /** Current loading/analysis stage (message key) */
  stage = $state<MessageKey | ''>('');
  error = $state('');
  duration = $state(0);
  decoder = $state<DecoderKind | null>(null);
  analysis = $state.raw<AnalysisResult | null>(null);
  analysisRate = $state(0);
  analyzing = $state(false);
  /** Incremented on every load – stale async results are discarded. */
  token = 0;

  constructor(slot: Slot) {
    this.slot = slot;
  }

  get ready(): boolean {
    return this.status === 'ready';
  }
}

export interface Toast { id: number; text: string; level: 'info' | 'warn' | 'error'; action?: { label: string; run: () => void } }

interface BlindState {
  mapping: Record<BlindKey, Slot>;
  selected: BlindKey;
  pick: BlindKey | null;
  revealed: boolean;
  /** Results of previous rounds: which file was preferred */
  rounds: Slot[];
}

interface AbxTrial { x: Slot; answer: Slot }
interface AbxState {
  x: Slot;
  listening: AbxKey;
  trials: AbxTrial[];
  target: number;
}

/** Unbiased coin flip from the CSPRNG. */
const randomSlot = (): Slot => (crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'B' : 'A');
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

class AppState {
  readonly tracks: Record<Slot, TrackState> = { A: new TrackState('A'), B: new TrackState('B') };

  playing = $state(false);
  position = $state(0);
  duration = $state(0);
  active = $state<Slot>('A');

  mode = $state<Mode>('compare');
  view = $state<View>('wave');
  levelMatch = $state(true);
  crossfadeMs = $state(8);
  volume = $state(0.9);
  loop = $state.raw<LoopRegion | null>(null);
  loopEnabled = $state(false);
  offsetB = $state(0);
  align = $state.raw<(AlignResult & { applied: boolean }) | null>(null);
  aligning = $state(false);
  outputMode = $state<OutputMode>('direct');
  airplayAvailable = $state(false);
  /** Audio is being re-initialised for a new output device */
  rebuilding = $state(false);

  settingsOpen = $state(false);
  helpOpen = $state(false);
  toasts = $state<Toast[]>([]);

  blind = $state<BlindState>({ mapping: { X: 'A', Y: 'B' }, selected: 'X', pick: null, revealed: false, rounds: [] });
  abx = $state<AbxState>({ x: 'A', listening: 'A', trials: [], target: 16 });

  private _engine: AudioEngine | null = null;
  private bridge: MediaBridge | null = null;
  private toastId = 0;
  private lastMediaSync = 0;
  /** Set when the output route may have changed (device change, interruption). */
  private routeDirty = false;
  private rebuildPromise: Promise<void> | null = null;

  // ---------------------------------------------------------------- Engine

  get engine(): AudioEngine | null {
    return this._engine;
  }

  ensureEngine(): AudioEngine {
    return this._engine ?? this.createEngine();
  }

  private createEngine(ctx?: AudioContext): AudioEngine {
    const engine = new AudioEngine(ctx);
    engine.crossfade = this.crossfadeMs / 1000;
    engine.setVolume(this.volume);
    engine.setActive(this.active);
    this._engine = engine;

    if (!this.bridge) {
      this.bridge = new MediaBridge({
        play: () => this.play(),
        pause: () => this.pause(),
        seekTo: (s) => this.seek(s),
        seekBy: (d) => this.seek(this.position + d),
        next: () => this.cycle(1),
        previous: () => this.cycle(-1),
      });
      this.bridge.onAirplayAvailability = (a) => (this.airplayAvailable = a);
      navigator.mediaDevices?.addEventListener?.('devicechange', () => (this.routeDirty = true));
    }
    engine.onNeedElementPlay = () => this.bridge?.play();
    if (this.outputMode === 'element') this.bridge.useStream(engine.setOutputMode('element'));

    engine.addEventListener('state', () => {
      if (this._engine !== engine) return;
      this.playing = engine.playing;
      this.position = engine.position;
      this.duration = engine.duration;
      const bridge = this.bridge;
      if (bridge) {
        if (engine.playing) bridge.play();
        else if (!bridge.isStreamMode) bridge.pause();
        bridge.setPlaybackState(engine.playing);
        bridge.setPosition(engine.duration, engine.position);
      }
    });
    engine.addEventListener('loop', () => {
      if (this._engine !== engine) return;
      this.loop = engine.loop;
      this.loopEnabled = engine.loopEnabled;
    });
    engine.ctx.addEventListener('statechange', () => {
      if (engine.ctx.state !== 'running' && engine.ctx.state !== 'closed') this.routeDirty = true;
    });
    return engine;
  }

  /** Called once per animation frame. */
  tick(now: number): void {
    const e = this._engine;
    if (!e) return;
    const p = e.position;
    if (p !== this.position) this.position = p;
    if (e.playing && now - this.lastMediaSync > 1000) {
      this.lastMediaSync = now;
      this.bridge?.setPosition(e.duration, p);
    }
  }

  // ---------------------------------------------------------------- Loading

  /** Distributes files to the slots (2 files → A and B, 1 file → first free slot). */
  loadFiles(files: File[], slot?: Slot): void {
    const audio = files.filter((f) => f.size > 0);
    if (!audio.length) return;
    if (slot) {
      void this.loadFile(slot, audio[0]);
      if (audio[1]) void this.loadFile(slot === 'A' ? 'B' : 'A', audio[1]);
      return;
    }
    if (audio.length >= 2) {
      void this.loadFile('A', audio[0]);
      void this.loadFile('B', audio[1]);
      return;
    }
    const target: Slot = this.tracks.A.status === 'empty' ? 'A' : 'B';
    void this.loadFile(target, audio[0]);
  }

  async loadFile(slot: Slot, file: File, allowFfmpeg = false): Promise<void> {
    if (this.rebuildPromise) await this.rebuildPromise;
    const tr = this.tracks[slot];
    const token = ++tr.token;
    const engine = this.ensureEngine();
    if (tr.meta?.coverUrl) URL.revokeObjectURL(tr.meta.coverUrl);
    tr.file = file;
    tr.status = 'loading';
    tr.stage = 'stageMeta';
    tr.error = '';
    tr.meta = null;
    tr.analysis = null;
    tr.analyzing = false;
    this.align = null;
    const current = () => token === tr.token;

    try {
      const meta = await readMetadata(file);
      if (!current()) {
        if (meta.coverUrl) URL.revokeObjectURL(meta.coverUrl);
        return;
      }
      tr.meta = meta;
      const res = await decodeAudioFile(engine.ctx, file, {
        nativeRate: meta.sampleRate,
        allowFfmpeg,
        onStage: (s) => current() && (tr.stage = s),
      });
      if (!current() || this._engine !== engine) return;
      engine.setBuffer(slot, res.playback);
      tr.decoder = res.decoder;
      tr.duration = res.playback.duration;
      tr.analysisRate = res.analysisRate;
      tr.status = 'ready';
      tr.stage = '';
      this.duration = engine.duration;
      this.applyCompensation();
      this.updateNowPlaying();
      if (res.playback.duration > LONG_TRACK_SECONDS) this.toast(t('toastLongTrack', { slot }), 'warn');

      // Analysis in the background (own worker)
      tr.analyzing = true;
      tr.stage = 'analyzing';
      const analysis = await analyzeChannels(
        res.analysisChannels,
        res.analysisRate,
        { columns: SPEC_COLUMNS, buckets: PEAK_BUCKETS, checkBits: meta.lossless !== false },
        (s) => current() && (tr.stage = s),
      );
      if (!current()) return;
      tr.analysis = analysis;
      tr.analyzing = false;
      tr.stage = '';
      this.applyCompensation();
      if (this.tracks.A.ready && this.tracks.B.ready) void this.autoAlign(false);
    } catch (err) {
      if (!current()) return;
      tr.analyzing = false;
      tr.stage = '';
      if (err instanceof NeedsFfmpegError) {
        tr.status = 'needs-ffmpeg';
        return;
      }
      if (tr.status === 'ready') {
        // Playback works, only the analysis failed
        this.toast(errorText(err), 'error');
        return;
      }
      tr.status = 'error';
      tr.error = errorText(err);
      engine.setBuffer(slot, null);
      this.duration = engine.duration;
    }
  }

  unload(slot: Slot): void {
    const tr = this.tracks[slot];
    tr.token++;
    if (tr.meta?.coverUrl) URL.revokeObjectURL(tr.meta.coverUrl);
    tr.file = null;
    tr.meta = null;
    tr.analysis = null;
    tr.analyzing = false;
    tr.status = 'empty';
    tr.stage = '';
    tr.error = '';
    tr.duration = 0;
    tr.decoder = null;
    this._engine?.setBuffer(slot, null);
    this.duration = this._engine?.duration ?? 0;
    this.align = null;
    if (slot === 'B') this.setOffsetB(0);
    this.applyCompensation();
    if (this.mode !== 'compare') this.setMode('compare');
  }

  // ---------------------------------------------------------------- Transport

  play(): void {
    if (this.rebuilding) return;
    const e = this.ensureEngine();
    // Start the media element inside the same gesture handler (iOS / Media Session)
    this.bridge?.play();

    // WebKit keeps the old sample rate after an output route change (AirPlay,
    // Bluetooth), which shifts the pitch. A fresh context reports the current
    // hardware rate; on mismatch the audio graph is rebuilt at the new rate.
    if (isAppleWebKit() || this.routeDirty) {
      this.routeDirty = false;
      const probe = tryCreateContext();
      if (probe && probe.sampleRate !== e.sampleRate) {
        void this.rebuildAudio(probe, true);
        return;
      }
      void probe?.close().catch(() => {});
    }
    void e.play();
  }

  pause(): void {
    this._engine?.pause();
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(s: number): void {
    const e = this._engine;
    if (!e) return;
    e.seek(s);
    this.position = e.position;
    this.bridge?.setPosition(e.duration, e.position);
  }

  /** Manual trigger from the settings (must run inside a click handler). */
  resetAudio(): void {
    if (!this._engine || this.rebuilding) return;
    const ctx = tryCreateContext();
    if (ctx) void this.rebuildAudio(ctx, this._engine.playing);
  }

  /**
   * Replaces the AudioContext (e.g. after the output device changed its sample rate)
   * and re-decodes both files so the browser's high-quality resampler targets the new rate.
   * Position, loop, offset, level matching and the selected source are preserved.
   */
  private rebuildAudio(ctx: AudioContext, playAfter: boolean): Promise<void> {
    const old = this._engine;
    if (!old || this.rebuildPromise) {
      void ctx.close().catch(() => {});
      return this.rebuildPromise ?? Promise.resolve();
    }
    // resume() must be called synchronously within the user gesture
    void ctx.resume().catch(() => {});
    this.rebuilding = true;
    const from = old.sampleRate;
    const to = ctx.sampleRate;
    const pos = old.position;
    const loop = old.loop;
    const loopEnabled = old.loopEnabled;
    if (from !== to) this.toast(t('toastRateChanged', { from: fmtRate(from), to: fmtRate(to) }));

    const run = async () => {
      old.pause();
      await old.dispose();
      const e = this.createEngine(ctx);
      try {
        for (const s of SLOTS) {
          const tr = this.tracks[s];
          if (!tr.ready || !tr.file) continue;
          const res = await decodeAudioFile(ctx, tr.file, {
            nativeRate: tr.meta?.sampleRate,
            allowFfmpeg: tr.decoder === 'ffmpeg',
            playbackOnly: true,
          });
          e.setBuffer(s, res.playback);
        }
        e.setOffsetB(this.offsetB);
        e.setLoop(loop);
        e.setLoopEnabled(loopEnabled);
        this.applyCompensation();
        this.duration = e.duration;
        e.seek(pos);
        this.position = e.position;
        if (playAfter) await e.play();
        if (from === to) this.toast(t('toastRebuilt', { rate: fmtRate(to) }));
      } catch (err) {
        this.toast(t('toastRebuildFailed', { error: errorText(err) }), 'error');
      } finally {
        this.rebuilding = false;
        this.rebuildPromise = null;
      }
    };
    this.rebuildPromise = run();
    return this.rebuildPromise;
  }

  // ---------------------------------------------------------------- A/B

  /** Selects the audible source at engine level. */
  private selectSlot(slot: Slot): void {
    this.active = slot;
    this.ensureEngine().setActive(slot);
    this.updateNowPlaying();
  }

  /** Compare mode: choose A or B. */
  select(slot: Slot): void {
    if (this.mode !== 'compare') return;
    this.selectSlot(slot);
  }

  /** Switches to the next source – A/B, X/Y or A/B/X depending on the mode. */
  cycle(dir: 1 | -1): void {
    if (this.mode === 'compare') this.selectSlot(this.active === 'A' ? 'B' : 'A');
    else if (this.mode === 'blind') this.blindSelect(this.blind.selected === 'X' ? 'Y' : 'X');
    else {
      const order: AbxKey[] = ['A', 'B', 'X'];
      const i = order.indexOf(this.abx.listening);
      this.abxListen(order[(i + dir + 3) % 3]);
    }
  }

  // ---------------------------------------------------------------- Modes

  get bothReady(): boolean {
    return this.tracks.A.ready && this.tracks.B.ready;
  }

  setMode(mode: Mode): void {
    if (mode !== 'compare' && !this.bothReady) {
      this.toast(t('toastNeedBoth'), 'warn');
      return;
    }
    this.mode = mode;
    if (mode !== 'compare' && !this.levelMatch) {
      this.levelMatch = true;
      this.applyCompensation();
      this.toast(t('toastLevelMatchForced'));
    }
    if (mode === 'blind') this.blindNewRound(true);
    else if (mode === 'abx') this.abxReset();
    else this.selectSlot(this.active);
    if (mode !== 'compare' && this.view !== 'wave') this.view = 'wave';
    this.updateNowPlaying();
  }

  blindSelect(key: BlindKey): void {
    if (this.mode !== 'blind') return;
    this.blind.selected = key;
    this.selectSlot(this.blind.mapping[key]);
  }

  blindPick(key: BlindKey): void {
    if (this.blind.revealed) return;
    this.blind.pick = key;
  }

  blindReveal(): void {
    if (this.blind.revealed) return;
    this.blind.revealed = true;
    if (this.blind.pick) this.blind.rounds = [...this.blind.rounds, this.blind.mapping[this.blind.pick]];
    this.updateNowPlaying();
  }

  blindNewRound(resetStats = false): void {
    const x = randomSlot();
    this.blind = {
      mapping: { X: x, Y: x === 'A' ? 'B' : 'A' },
      selected: 'X',
      pick: null,
      revealed: false,
      rounds: resetStats ? [] : this.blind.rounds,
    };
    this.selectSlot(this.blind.mapping.X);
  }

  abxListen(key: AbxKey): void {
    if (this.mode !== 'abx') return;
    this.abx.listening = key;
    this.selectSlot(key === 'X' ? this.abx.x : key);
  }

  abxAnswer(answer: Slot): void {
    if (this.mode !== 'abx' || this.abx.trials.length >= this.abx.target) return;
    this.abx.trials = [...this.abx.trials, { x: this.abx.x, answer }];
    this.abx.x = randomSlot();
    if (this.abx.listening === 'X') this.selectSlot(this.abx.x);
  }

  abxReset(): void {
    this.abx = { x: randomSlot(), listening: 'A', trials: [], target: this.abx.target };
    this.selectSlot('A');
  }

  // ---------------------------------------------------------------- Level

  /** Level-match gain in dB per slot (only the louder source is attenuated → no clipping). */
  get compensation(): Record<Slot, number> {
    const la = this.tracks.A.analysis?.loudness.integrated;
    const lb = this.tracks.B.analysis?.loudness.integrated;
    if (!this.levelMatch || la === undefined || lb === undefined || !Number.isFinite(la) || !Number.isFinite(lb)) {
      return { A: 0, B: 0 };
    }
    const target = Math.min(la, lb);
    return { A: target - la, B: target - lb };
  }

  applyCompensation(): void {
    const e = this._engine;
    if (!e) return;
    const comp = this.compensation;
    for (const s of SLOTS) e.setCompensation(s, comp[s]);
  }

  setLevelMatch(on: boolean): void {
    this.levelMatch = on;
    this.applyCompensation();
    if (!on && this.mode !== 'compare') this.toast(t('toastLevelMatchOff'), 'warn');
  }

  setVolume(v: number): void {
    this.volume = v;
    this._engine?.setVolume(v);
  }

  setCrossfade(ms: number): void {
    this.crossfadeMs = ms;
    if (this._engine) this._engine.crossfade = ms / 1000;
  }

  // ---------------------------------------------------------------- Loop

  setLoop(region: LoopRegion | null, enable?: boolean): void {
    const e = this.ensureEngine();
    e.setLoop(region);
    if (enable !== undefined) e.setLoopEnabled(enable);
    this.loop = e.loop;
    this.loopEnabled = e.loopEnabled;
  }

  toggleLoop(): void {
    const e = this.ensureEngine();
    if (!e.loop) {
      // No region yet: 8 seconds from the playhead
      const start = this.position;
      this.setLoop({ start, end: Math.min(this.duration, start + 8) }, true);
      return;
    }
    e.setLoopEnabled(!e.loopEnabled);
    this.loopEnabled = e.loopEnabled;
  }

  setLoopPoint(which: 'start' | 'end'): void {
    const p = this.position;
    const cur = this.loop ?? { start: 0, end: this.duration };
    const region = which === 'start' ? { start: p, end: Math.max(cur.end, p + 0.1) } : { start: Math.min(cur.start, p - 0.1), end: p };
    region.start = Math.max(0, region.start);
    this.setLoop(region, true);
  }

  clearLoop(): void {
    this.setLoop(null, false);
  }

  // ---------------------------------------------------------------- Offset

  setOffsetB(seconds: number): void {
    this.offsetB = seconds;
    const e = this._engine;
    if (e) {
      e.setOffsetB(seconds);
      this.duration = e.duration;
    }
  }

  async autoAlign(manual: boolean): Promise<void> {
    const e = this._engine;
    const a = e?.buffer('A');
    const b = e?.buffer('B');
    if (!e || !a || !b || this.aligning) return;
    this.aligning = true;
    try {
      const mono = (buf: AudioBuffer, seconds: number) => {
        const n = Math.min(buf.length, Math.floor(seconds * buf.sampleRate));
        const out = new Float32Array(n);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
        }
        return out;
      };
      const res = await alignTracks(mono(a, ALIGN_SECONDS), mono(b, ALIGN_SECONDS + 10), e.sampleRate);
      const confident = Math.abs(res.correlation) >= 0.5;
      const ms = res.offset * 1000;
      if (confident && Math.abs(ms) >= 0.05) {
        const prev = this.offsetB;
        this.setOffsetB(res.offset);
        this.align = { ...res, applied: true };
        this.toast(t('toastAligned', { ms: fmtSigned(ms, 'ms'), corr: res.correlation.toFixed(2) }), 'info', {
          label: t('undo'),
          run: () => {
            this.setOffsetB(prev);
            if (this.align) this.align = { ...this.align, applied: false };
          },
        });
      } else {
        this.align = { ...res, applied: false };
        if (manual) this.toast(confident ? t('toastAlreadyAligned') : t('toastNoMatch'), confident ? 'info' : 'warn');
      }
      if (res.correlation < -0.5) this.toast(t('toastPolarity'), 'warn');
    } catch (err) {
      if (manual) this.toast(t('toastAlignFailed', { error: errorText(err) }), 'error');
    } finally {
      this.aligning = false;
    }
  }

  // ---------------------------------------------------------------- Output

  setOutputMode(mode: OutputMode): void {
    const e = this.ensureEngine();
    this.outputMode = mode;
    const stream = e.setOutputMode(mode);
    this.bridge?.useStream(stream);
    if (e.playing) this.bridge?.play();
  }

  showAirPlay(): void {
    if (this.outputMode !== 'element') this.setOutputMode('element');
    this.bridge?.showAirPlayPicker();
  }

  // ---------------------------------------------------------------- Display

  /** Hides identities in blind (until revealed) and ABX mode. */
  get hidesIdentity(): boolean {
    return (this.mode === 'blind' && !this.blind.revealed) || this.mode === 'abx';
  }

  updateNowPlaying(): void {
    const bridge = this.bridge;
    if (!bridge) return;
    if (this.mode === 'blind' && !this.blind.revealed) {
      bridge.setNowPlaying({ title: t('anonSource', { key: this.blind.selected }), artist: t('mediaBlindArtist') });
      return;
    }
    if (this.mode === 'abx') {
      bridge.setNowPlaying({ title: `ABX · ${this.abx.listening}`, artist: t('mediaAbxArtist') });
      return;
    }
    const m = this.tracks[this.active].meta;
    bridge.setNowPlaying({
      title: `${m?.title ?? m?.fileName ?? 'TrackSwap'} · ${this.active}`,
      artist: m?.artist ?? 'TrackSwap A/B',
      album: m?.album,
      artworkUrl: m?.coverUrl,
    });
  }

  toast(text: string, level: Toast['level'] = 'info', action?: Toast['action']): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, text, level, action }];
    setTimeout(() => this.dismissToast(id), action ? 9000 : 5000);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((x) => x.id !== id);
  }
}

function tryCreateContext(): AudioContext | null {
  try {
    return createAudioContext();
  } catch {
    return null;
  }
}

export const app = new AppState();
