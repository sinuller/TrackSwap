import { parseBlob, selectCover, type IAudioMetadata } from 'music-metadata';

export interface TrackMeta {
  fileName: string;
  fileSize: number;
  extension: string;

  container?: string;
  codec?: string;
  codecProfile?: string;
  encoder?: string;
  lossless?: boolean;
  bitrate?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  channels?: number;
  duration?: number;
  replayGain?: number;

  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  track?: string;
  coverUrl?: string;
  lyrics?: string;
}

const LOSSLESS_CODECS = /pcm|flac|alac|wavpack|monkey|ape|tta|shorten|mlp|truehd|lossless|aiff/i;
const LOSSY_CODECS = /mpeg|mp3|mp2|aac|vorbis|opus|wma|ac-?3|dts|musepack|speex|amr/i;

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function lyricsFrom(meta: IAudioMetadata): string | undefined {
  const lyr = meta.common.lyrics as unknown;
  if (!Array.isArray(lyr) || !lyr.length) return undefined;
  const parts = lyr
    .map((l: unknown) => {
      if (typeof l === 'string') return l;
      const tag = l as { text?: string; syncText?: { text: string }[] };
      if (tag.text) return tag.text;
      if (tag.syncText?.length) return tag.syncText.map((s) => s.text).join('\n');
      return '';
    })
    .filter(Boolean);
  return parts.length ? parts.join('\n\n').trim() : undefined;
}

/** Reads technical data and tags (ID3, Vorbis comments, MP4, RIFF INFO, APE …). */
export async function readMetadata(file: File): Promise<TrackMeta> {
  const base: TrackMeta = { fileName: file.name, fileSize: file.size, extension: extensionOf(file.name) };
  let meta: IAudioMetadata;
  try {
    meta = await parseBlob(file, { skipPostHeaders: false });
  } catch {
    return base;
  }
  const f = meta.format;
  const c = meta.common;
  const codec = f.codec;
  let lossless = f.lossless;
  if (lossless === undefined && codec) {
    if (LOSSLESS_CODECS.test(codec)) lossless = true;
    else if (LOSSY_CODECS.test(codec)) lossless = false;
  }
  const cover = selectCover(c.picture);
  const coverUrl = cover
    ? URL.createObjectURL(new Blob([cover.data as BlobPart], { type: cover.format || 'image/jpeg' }))
    : undefined;

  return {
    ...base,
    container: f.container,
    codec,
    codecProfile: f.codecProfile,
    encoder: f.tool,
    lossless,
    bitrate: f.bitrate,
    sampleRate: f.sampleRate,
    bitsPerSample: f.bitsPerSample,
    channels: f.numberOfChannels,
    duration: f.duration,
    replayGain: f.trackGain,
    title: c.title,
    artist: c.artist ?? c.artists?.join(', '),
    album: c.album,
    albumArtist: c.albumartist,
    year: c.year,
    genre: c.genre?.join(', '),
    track: c.track?.no ? (c.track.of ? `${c.track.no}/${c.track.of}` : String(c.track.no)) : undefined,
    coverUrl,
    lyrics: lyricsFrom(meta),
  };
}
