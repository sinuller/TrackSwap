/**
 * Platform integration: Media Session (lock screen, hardware/headphone buttons),
 * iOS audio session (playback despite the mute switch) and AirPlay.
 *
 * Browsers only show Media Session controls for a playing media element. In
 * "direct" mode a silent <audio> element therefore runs alongside; in "element"
 * mode it plays the actual mix as a MediaStream (required for the AirPlay picker).
 */

export interface MediaHandlers {
  play(): void;
  pause(): void;
  seekTo(t: number): void;
  seekBy(delta: number): void;
  next(): void;
  previous(): void;
}

export interface NowPlaying {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
}

function silentWavUrl(seconds = 10, rate = 8000): string {
  const frames = seconds * rate;
  const buf = new ArrayBuffer(44 + frames * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + frames * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, frames * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class MediaBridge {
  readonly el: HTMLAudioElement;
  private readonly silentUrl: string;
  private streamMode = false;
  airplayAvailable = false;
  onAirplayAvailability: ((available: boolean) => void) | null = null;

  constructor(handlers: MediaHandlers) {
    this.el = document.createElement('audio');
    this.el.setAttribute('x-webkit-airplay', 'allow');
    this.el.setAttribute('playsinline', '');
    this.el.preload = 'auto';
    this.silentUrl = silentWavUrl();
    this.el.src = this.silentUrl;
    this.el.loop = true;
    document.body.appendChild(this.el);

    // iOS 16.4+ / Safari 17: treat Web Audio as media playback (ignores the mute switch)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
      } catch {
        /* not supported */
      }
    }

    if ('WebKitPlaybackTargetAvailabilityEvent' in window) {
      this.el.addEventListener('webkitplaybacktargetavailabilitychanged', (e: Event) => {
        this.airplayAvailable = (e as Event & { availability: string }).availability === 'available';
        this.onAirplayAvailability?.(this.airplayAvailable);
      });
    }

    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* action not supported */
      }
    };
    set('play', () => handlers.play());
    set('pause', () => handlers.pause());
    set('stop', () => handlers.pause());
    set('seekto', (d) => d.seekTime !== undefined && handlers.seekTo(d.seekTime));
    set('seekbackward', (d) => handlers.seekBy(-(d.seekOffset ?? 5)));
    set('seekforward', (d) => handlers.seekBy(d.seekOffset ?? 5));
    // Next/previous (e.g. double tap on AirPods) switches between the sources
    set('nexttrack', () => handlers.next());
    set('previoustrack', () => handlers.previous());
  }

  /** Plays the real mix (MediaStream) or the silent placeholder. */
  useStream(stream: MediaStream | null): void {
    const wasPlaying = !this.el.paused;
    if (stream) {
      this.streamMode = true;
      this.el.loop = false;
      this.el.removeAttribute('src');
      this.el.srcObject = stream;
    } else {
      this.streamMode = false;
      this.el.srcObject = null;
      this.el.src = this.silentUrl;
      this.el.loop = true;
    }
    if (wasPlaying) void this.el.play().catch(() => {});
  }

  get isStreamMode(): boolean {
    return this.streamMode;
  }

  /** Must be called synchronously inside a user-gesture handler. */
  play(): void {
    void this.el.play().catch(() => {});
  }

  pause(): void {
    this.el.pause();
  }

  setPlaybackState(playing: boolean): void {
    if (navigator.mediaSession) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  setNowPlaying(info: NowPlaying): void {
    if (!navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title,
      artist: info.artist,
      album: info.album ?? 'TrackSwap',
      artwork: info.artworkUrl ? [{ src: info.artworkUrl, sizes: '512x512' }] : [],
    });
  }

  setPosition(duration: number, position: number): void {
    const ms = navigator.mediaSession;
    if (!ms?.setPositionState || !(duration > 0)) return;
    try {
      ms.setPositionState({ duration, position: Math.min(Math.max(0, position), duration), playbackRate: 1 });
    } catch {
      /* invalid state */
    }
  }

  showAirPlayPicker(): void {
    const el = this.el as HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void };
    el.webkitShowPlaybackTargetPicker?.();
  }
}
