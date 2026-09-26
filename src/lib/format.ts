import { i18n, t } from './i18n.svelte';

const nf = (digits: number) =>
  new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtTime(sec: number, precise = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (precise) {
    const whole = Math.floor(s);
    const tenth = Math.floor((s - whole) * 10);
    return `${m}:${String(whole).padStart(2, '0')}.${tenth}`;
  }
  return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${nf(1).format(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${nf(1).format(n / 1024 ** 2)} MB`;
  return `${nf(1).format(n / 1024 ** 3)} GB`;
}

export function fmtRate(hz?: number): string {
  if (!hz) return '–';
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} kHz`;
}

export function fmtKbps(bps?: number): string {
  if (!bps) return '–';
  return `${nf(0).format(Math.round(bps / 1000))} kbps`;
}

export function fmtDb(v: number | undefined, unit = 'dB', digits = 1): string {
  if (v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v < 0 ? `−∞ ${unit}` : `∞ ${unit}`;
  const s = v.toFixed(digits).replace('-', '−');
  return `${s} ${unit}`;
}

export function fmtSigned(v: number, unit = 'dB', digits = 1): string {
  const s = Math.abs(v).toFixed(digits);
  const sign = v > 0.0001 ? '+' : v < -0.0001 ? '−' : '±';
  return `${sign}${s} ${unit}`;
}

export function fmtKHz(hz: number): string {
  return `${(hz / 1000).toFixed(1)} kHz`;
}

export function fmtChannels(n?: number): string {
  if (!n) return '–';
  return n === 1 ? t('mono') : n === 2 ? t('stereo') : t('channelsN', { n });
}

/** Short quality label, e.g. "FLAC · 24/96" or "MP3 · 320 kbps" */
export function qualityLabel(meta: {
  codec?: string;
  container?: string;
  extension: string;
  lossless?: boolean;
  bitsPerSample?: number;
  sampleRate?: number;
  bitrate?: number;
}): string {
  const fmt = shortCodec(meta);
  if (meta.lossless) {
    const bits = meta.bitsPerSample ? `${meta.bitsPerSample}` : '?';
    const rate = meta.sampleRate ? `${+(meta.sampleRate / 1000).toFixed(1)}` : '?';
    return `${fmt} · ${bits}/${rate}`;
  }
  return meta.bitrate ? `${fmt} · ${Math.round(meta.bitrate / 1000)} kbps` : fmt;
}

export function shortCodec(meta: { codec?: string; container?: string; extension: string }): string {
  const c = (meta.codec ?? '').toLowerCase();
  if (c.includes('mpeg') && c.includes('layer 3')) return 'MP3';
  if (c.includes('layer 2')) return 'MP2';
  if (c.includes('flac')) return 'FLAC';
  if (c.includes('alac')) return 'ALAC';
  if (c.includes('aac')) return 'AAC';
  if (c.includes('opus')) return 'Opus';
  if (c.includes('vorbis')) return 'Vorbis';
  if (c.includes('pcm')) return meta.extension === 'aif' || meta.extension === 'aiff' ? 'AIFF' : 'WAV';
  if (c.includes('wavpack')) return 'WavPack';
  if (c.includes('monkey')) return 'APE';
  if (c.includes('wma')) return 'WMA';
  if (c.includes('dsd')) return 'DSD';
  if (meta.codec) return meta.codec;
  return meta.extension ? meta.extension.toUpperCase() : 'Audio';
}
