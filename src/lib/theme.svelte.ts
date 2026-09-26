export type ThemeSetting = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'trackswap.theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0e1014', light: '#f3f4f7' };

function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage unavailable (private mode) */
  }
  return 'auto';
}

const lightQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : undefined;

/**
 * Colour theme: follows the device setting ("auto") unless the user picks one.
 * The resolved theme is written to <html data-theme> (see also public/theme-init.js).
 */
class ThemeState {
  setting = $state<ThemeSetting>(readSetting());
  system = $state<Theme>(lightQuery?.matches ? 'light' : 'dark');
  resolved = $derived<Theme>(this.setting === 'auto' ? this.system : this.setting);

  constructor() {
    lightQuery?.addEventListener('change', (e) => {
      this.system = e.matches ? 'light' : 'dark';
      this.apply();
    });
    this.apply();
  }

  set(setting: ThemeSetting): void {
    this.setting = setting;
    try {
      if (setting === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, setting);
    } catch {
      /* storage unavailable */
    }
    this.apply();
  }

  /** Applies the theme synchronously so CSS variables are current before anything reads them. */
  private apply(): void {
    if (typeof document === 'undefined') return;
    const t = this.setting === 'auto' ? this.system : this.setting;
    document.documentElement.dataset.theme = t;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_COLOR[t];
    }
  }
}

export const theme = new ThemeState();

/** Colours used by the canvas views, read from the CSS variables of the current theme. */
export interface CanvasPalette {
  a: string;
  b: string;
  aRgb: [number, number, number];
  bRgb: [number, number, number];
  neutral: string;
  bg: string;
  ruler: string;
  line: string;
  grid: string;
  gridStrong: string;
  tick: string;
  text: string;
  faint: string;
  dim: string;
  hover: string;
  tipBg: string;
  tipFg: string;
  hatchBg: string;
  hatch: string;
  playhead: string;
  loopFill: string;
  loopFillOff: string;
  good: string;
  muted: string;
  onAccent: string;
}

let cache: { theme: Theme; palette: CanvasPalette } | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}

export function canvasPalette(): CanvasPalette {
  const t = theme.resolved;
  if (cache?.theme === t) return cache.palette;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const palette: CanvasPalette = {
    a: v('--a'),
    b: v('--b'),
    aRgb: hexToRgb(v('--a')),
    bRgb: hexToRgb(v('--b')),
    neutral: v('--neutral-wave'),
    bg: v('--canvas'),
    ruler: v('--canvas-ruler'),
    line: v('--canvas-line'),
    grid: v('--canvas-grid'),
    gridStrong: v('--canvas-grid-strong'),
    tick: v('--canvas-tick'),
    text: v('--canvas-text'),
    faint: v('--canvas-faint'),
    dim: v('--canvas-dim'),
    hover: v('--canvas-hover'),
    tipBg: v('--canvas-tip-bg'),
    tipFg: v('--canvas-tip-fg'),
    hatchBg: v('--canvas-hatch-bg'),
    hatch: v('--canvas-hatch'),
    playhead: v('--playhead'),
    loopFill: v('--loop-fill'),
    loopFillOff: v('--loop-fill-off'),
    good: v('--good'),
    muted: v('--muted'),
    onAccent: v('--on-accent'),
  };
  cache = { theme: t, palette };
  return palette;
}
