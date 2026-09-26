// Applies the colour theme before the first paint (avoids a flash of the wrong theme).
// Kept as a tiny external file so the Content Security Policy can forbid inline scripts.
(function () {
  var setting = null;
  try {
    setting = localStorage.getItem('trackswap.theme');
  } catch (e) {
    /* storage unavailable */
  }
  var theme =
    setting === 'light' || setting === 'dark'
      ? setting
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
