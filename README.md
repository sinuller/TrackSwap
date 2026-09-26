<div align="center">

# TrackSwap – A/B Audio Compare

**Compare two audio files seamlessly – right in your browser.**

<a href="https://sinuller.github.io/TrackSwap/"><img src="https://img.shields.io/badge/%E2%96%B6%20Open%20TrackSwap-use%20it%20now%20in%20your%20browser-ffb020?style=for-the-badge&labelColor=14171c" alt="Open TrackSwap – use it now in your browser" height="42"></a>

**Ready to use – no installation, no sign-up, no upload.**<br>
Just open **[sinuller.github.io/TrackSwap](https://sinuller.github.io/TrackSwap/)**, drop two audio files and start comparing.<br>
Works on desktop and mobile · [Deutsch](#deutsch)

</div>

---

TrackSwap plays two audio files **sample-accurately in sync** and switches between them
**instantly and seamlessly** – same position, no dropout, no click. Built for producers,
mixing/mastering engineers and audiophiles who want to compare mixes, masters or formats
(e.g. FLAC vs. MP3) fairly and without bias.

Everything runs **locally in your browser**. Your files are never uploaded.

## Features

- **Seamless A/B switching** – both tracks run in parallel on the Web Audio clock; switching
  only crossfades the gain (5–10 ms, adjustable), so the playhead never moves.
- **Fair comparison**
  - Loudness matching per **EBU R128 / ITU-R BS.1770-4** (the louder track is attenuated, never boosted)
  - Automatic **time alignment** via cross-correlation (e.g. MP3 encoder delay), manual fine-tuning in 0.1 ms steps
- **Blind test** (anonymised X/Y) and **ABX test** with binomial statistics (p-value)
- **Quality analysis**
  - Format, container, codec, encoder, bitrate, sample rate, bit depth, channels, lossy/lossless
  - Integrated loudness, loudness range, true peak (4× oversampling), sample peak, PLR, RMS, clipping
  - **Effective bit depth** (detects 16-bit material padded to 24 bit)
  - **High-frequency cutoff detection** (detects lossy sources and "fake lossless", upsampled hi-res)
  - Tags, cover art and lyrics (ID3, Vorbis comments, MP4, RIFF INFO, APE …)
- **Visual comparison** – synchronized waveforms, spectrograms and a live/average FFT analyser
- **Click-free loops** – drag a region; the loop wrap is equal-power crossfaded
- **Formats** – everything the browser decodes (MP3, WAV, FLAC, AAC/M4A, OGG/Opus …), a built-in
  AIFF decoder, and an optional on-demand **ffmpeg.wasm** fallback (ALAC, WMA, APE, WavPack, DSD …)
- **Mobile** – large touch controls, Media Session (lock screen, headphone buttons: *next track*
  switches the source), AirPlay, installable as a PWA and usable offline
- **German & English UI** and **light / dark mode** (both follow the device, switchable in the settings)

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `1` `2` `3` / `A` `B` `X` `Y` | Select source |
| `T`, `↑`, `↓` | Switch to the other source |
| `←` `→` | Seek ±5 s (with `Shift`: ±1 s) |
| `L`, `[`, `]` | Loop on/off, set loop start/end |
| `?` | Help |

## Notes on accuracy

- The loudness meter is verified against the reference signals of **EBU Tech 3341/3342**
  (see `src/analysis/loudness.test.ts`).
- Playback buffers are resampled to the output device's rate by the browser's high-quality
  resampler; the analysis always runs on the file's **native** sample rate.
- Over AirPlay/Bluetooth, switching is heard with the wireless latency (AirPlay ≈ 2 s) but stays
  seamless. If the output device changes its sample rate (e.g. switching to AirPlay on iOS),
  TrackSwap re-initialises the audio on the next play to avoid pitch errors in Safari.

## Development

> **You don't need any of this to use TrackSwap** – the app is already hosted at
> **[sinuller.github.io/TrackSwap](https://sinuller.github.io/TrackSwap/)**.
> This section is only for people who want to modify the code.

Requires Node.js 22+.

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (DSP, parsers, translations)
npm run check    # type check
npm run build    # production build → dist/
```

Stack: [Svelte 5](https://svelte.dev) + TypeScript + [Vite](https://vite.dev), Web Audio API,
[music-metadata](https://github.com/Borewit/music-metadata), optional
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm). DSP (FFT, loudness, true peak,
spectrogram, alignment) is implemented in `src/analysis` and runs in Web Workers.

```
src/
  engine/     audio engine (sync, switching, loops), decoders (native, AIFF, ffmpeg)
  analysis/   metadata, loudness, spectrum/cutoff, bit depth, alignment, worker
  platform/   Media Session, AirPlay, device detection
  lib/        app state, i18n, formatting, quality hints
  ui/         Svelte components
```

Pushing to `main` builds, tests and deploys to GitHub Pages
(`.github/workflows/deploy.yml`). The build uses relative paths, so `dist/` can also be
hosted on any static web server.

See [SECURITY.md](SECURITY.md) for the security model.

---

## Deutsch

<div align="center">

<a href="https://sinuller.github.io/TrackSwap/"><img src="https://img.shields.io/badge/%E2%96%B6%20TrackSwap%20%C3%B6ffnen-direkt%20im%20Browser%20nutzen-ffb020?style=for-the-badge&labelColor=14171c" alt="TrackSwap öffnen – direkt im Browser nutzen" height="42"></a>

**Sofort nutzbar – keine Installation, keine Anmeldung, kein Upload.**<br>
Einfach **[sinuller.github.io/TrackSwap](https://sinuller.github.io/TrackSwap/)** öffnen, zwei Audiodateien hineinziehen und vergleichen.

</div>

**TrackSwap** spielt zwei Audiodateien **sample-genau synchron** ab und schaltet
**sofort und nahtlos** zwischen ihnen um – an derselben Position, ohne Aussetzer und ohne Knacken.
Gedacht für Produzenten, Mix-/Mastering-Engineers und Audiophile, die Mixe, Master oder Formate
(z. B. FLAC vs. MP3) fair und unvoreingenommen vergleichen wollen.

Alles läuft **lokal im Browser** – die Dateien werden nirgends hochgeladen.

- **Nahtloses A/B-Umschalten** mit einstellbarem Mikro-Crossfade
- **Fairer Vergleich:** Pegelausgleich nach EBU R128, automatische zeitliche Ausrichtung
- **Blindtest** (X/Y) und **ABX-Test** mit statistischer Auswertung
- **Qualitätsanalyse:** Bitrate, Abtastrate, Bit-Tiefe (inkl. effektiver Bit-Tiefe), LUFS, LRA,
  True Peak, PLR, Clipping, Höhen-Cutoff (erkennt Fake-Lossless und hochgerechnetes Hi-Res),
  Tags, Cover und Songtexte
- **Waveform, Spektrogramm und Frequenzanalyse** synchron zum Playhead
- **Knackfreie Loops**, Tastenkürzel, Handy-Bedienung, Media Session, AirPlay, Offline-Nutzung (PWA)
- **Deutsch/Englisch** sowie **Hell-/Dunkelmodus**, beides automatisch nach Gerät und in den Einstellungen umschaltbar

Der Abschnitt „Development“ oben ist nur für Leute gedacht, die den Code verändern möchten – zum Benutzen reicht der Link.
