# Security

TrackSwap is a purely client-side web app. Audio files are decoded and analysed
locally in the browser and are never uploaded anywhere.

- **No backend, no tracking, no cookies.** The only persisted value is the chosen
  UI language (`localStorage`).
- **Content Security Policy:** the production build ships a strict CSP. Scripts,
  workers and styles are only loaded from the app's own origin.
- **Optional ffmpeg.wasm decoder:** only for formats the browser cannot decode,
  and only after the user confirms. It is downloaded from jsDelivr and verified
  with Subresource Integrity (SHA-384) before use.
- **Untrusted input:** metadata (titles, lyrics, …) is rendered as plain text;
  the built-in WAV/AIFF parsers validate headers and sizes.
- **Dependencies** are kept up to date via Dependabot.

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](../../security/advisories/new) instead of opening a public issue.
