import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { DecodeStage } from './decode';

/**
 * ffmpeg.wasm core, loaded on demand from jsDelivr. The version must match the
 * installed @ffmpeg/ffmpeg library. Both files are verified with Subresource
 * Integrity before use – a tampered CDN response is rejected by the browser.
 */
const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm';
const CORE_FILES = {
  js: {
    url: `${CORE_BASE}/ffmpeg-core.js`,
    type: 'text/javascript',
    integrity: 'sha384-9KlAmgHu5wDqdgQvFhQGZOtKdCwGcMppDhM/kBkUpZ5LS7KGuAHbE+NgtJQEf84i',
  },
  wasm: {
    url: `${CORE_BASE}/ffmpeg-core.wasm`,
    type: 'application/wasm',
    integrity: 'sha384-U1VDhkPYrM3wTCT4/vjSpSsKqG/UjljYrYCI4hBSJ02svbCkxuCi6U6u/peg5vpW',
  },
} as const;

let instance: Promise<FFmpeg> | null = null;

async function verifiedBlobUrl(file: { url: string; type: string; integrity: string }): Promise<string> {
  const res = await fetch(file.url, { integrity: file.integrity, mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const data = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([data], { type: file.type }));
}

async function load(onStage?: (s: DecodeStage) => void): Promise<FFmpeg> {
  onStage?.('stageFfmpegLoad');
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const [coreURL, wasmURL] = await Promise.all([verifiedBlobUrl(CORE_FILES.js), verifiedBlobUrl(CORE_FILES.wasm)]);
  const ff = new FFmpeg();
  await ff.load({ coreURL, wasmURL });
  return ff;
}

/**
 * Converts any audio format ffmpeg understands (ALAC, WMA, APE, WavPack, DSD, Opus …)
 * into a WAV file (32-bit float, native sample rate).
 */
export async function convertToWav(bytes: ArrayBuffer, sourceRate: number | undefined, onStage?: (s: DecodeStage) => void): Promise<ArrayBuffer> {
  instance ??= load(onStage).catch((err) => {
    instance = null;
    throw err;
  });
  const ff = await instance;
  onStage?.('stageFfmpegDecode');
  const input = 'input.bin';
  const output = 'output.wav';
  await ff.writeFile(input, new Uint8Array(bytes));
  try {
    const args = ['-hide_banner', '-i', input, '-vn', '-map', '0:a:0', '-c:a', 'pcm_f32le'];
    // DSD & co.: limit to a sensible PCM rate
    if (sourceRate && sourceRate > 192000) args.push('-ar', sourceRate % 44100 === 0 ? '176400' : '192000');
    args.push('-y', output);
    const code = await ff.exec(args);
    if (code !== 0) throw new Error('ffmpeg could not decode the file');
    const data = (await ff.readFile(output)) as Uint8Array;
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } finally {
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile(output).catch(() => {});
  }
}
