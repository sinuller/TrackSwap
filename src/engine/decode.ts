import { decodeAiff, isAiff } from './aiff';
import { decodeWav, encodeWavFloat32, type PcmData } from './pcm';
import type { MessageKey } from '../lib/i18n.svelte';

/** Approximate download size of ffmpeg.wasm (shown to the user before loading). */
export const FFMPEG_DOWNLOAD_MB = 31;

export type DecoderKind = 'native' | 'aiff' | 'ffmpeg';
export type DecodeStage = Extract<MessageKey, `stage${string}`>;

export interface DecodeResult {
  /** Playback buffer at the AudioContext's sample rate (resampled by the browser's high-quality resampler) */
  playback: AudioBuffer;
  /** Channel data at the file's native sample rate for analysis (own copies, transferable) */
  analysisChannels: Float32Array[];
  analysisRate: number;
  decoder: DecoderKind;
}

export interface DecodeOptions {
  /** Native sample rate from the metadata (for analysis without resampling) */
  nativeRate?: number;
  /** Allow the ffmpeg.wasm fallback */
  allowFfmpeg: boolean;
  /** Skip the native-rate analysis copy (e.g. when only re-creating playback buffers) */
  playbackOnly?: boolean;
  onStage?: (stage: DecodeStage) => void;
}

/** The browser cannot decode the format – ffmpeg.wasm would be needed. */
export class NeedsFfmpegError extends Error {
  constructor() {
    super('Format not supported by this browser');
    this.name = 'NeedsFfmpegError';
  }
}

async function decodeAtRate(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, 1, rate);
  return off.decodeAudioData(bytes);
}

function copyChannels(buf: AudioBuffer): Float32Array[] {
  return Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice());
}

async function pcmToPlayback(ctx: BaseAudioContext, pcm: PcmData, wav?: ArrayBuffer): Promise<AudioBuffer> {
  if (pcm.sampleRate === ctx.sampleRate) {
    const buf = ctx.createBuffer(pcm.channels.length, pcm.channels[0].length, pcm.sampleRate);
    pcm.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
    return buf;
  }
  // Detour via WAV so decodeAudioData resamples with the browser's high-quality resampler.
  return ctx.decodeAudioData(wav ?? encodeWavFloat32(pcm));
}

/**
 * Decodes an audio file: native browser decoder first, then the built-in AIFF
 * decoder, then (only with consent) ffmpeg.wasm.
 */
export async function decodeAudioFile(ctx: BaseAudioContext, file: File, opts: DecodeOptions): Promise<DecodeResult> {
  const bytes = await file.arrayBuffer();
  opts.onStage?.('stageDecode');

  // 1) Native browser decoder
  let playback: AudioBuffer | null = null;
  try {
    playback = await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    playback = null;
  }
  if (playback) {
    if (opts.playbackOnly) return { playback, analysisChannels: [], analysisRate: playback.sampleRate, decoder: 'native' };
    const rate = opts.nativeRate;
    if (rate && rate !== ctx.sampleRate && rate >= 3000 && rate <= 384000) {
      opts.onStage?.('stageDecodeNative');
      try {
        const native = await decodeAtRate(bytes, rate);
        return { playback, analysisChannels: copyChannels(native), analysisRate: native.sampleRate, decoder: 'native' };
      } catch {
        /* fall back to the playback buffer */
      }
    }
    return { playback, analysisChannels: copyChannels(playback), analysisRate: playback.sampleRate, decoder: 'native' };
  }

  // 2) Built-in AIFF decoder (Chrome/Firefox cannot decode AIFF)
  if (isAiff(bytes)) {
    try {
      const pcm = decodeAiff(bytes);
      const pb = await pcmToPlayback(ctx, pcm);
      return { playback: pb, analysisChannels: pcm.channels, analysisRate: pcm.sampleRate, decoder: 'aiff' };
    } catch {
      /* e.g. compressed AIFF-C → ffmpeg */
    }
  }

  // 3) ffmpeg.wasm
  if (!opts.allowFfmpeg) throw new NeedsFfmpegError();
  const { convertToWav } = await import('./ffmpeg');
  const wav = await convertToWav(bytes, opts.nativeRate, opts.onStage);
  const pcm = decodeWav(wav);
  opts.onStage?.('stagePrepare');
  const pb = await pcmToPlayback(ctx, pcm, wav);
  return { playback: pb, analysisChannels: pcm.channels, analysisRate: pcm.sampleRate, decoder: 'ffmpeg' };
}
