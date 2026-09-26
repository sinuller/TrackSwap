/**
 * True on iPhone/iPad (all iOS browsers use WebKit) and desktop Safari.
 * WebKit may keep playing at the old sample rate after the output route changes
 * (e.g. switching to AirPlay or Bluetooth), which shifts the pitch – see app.play().
 */
export function isAppleWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac but has touch support
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(ua);
}
