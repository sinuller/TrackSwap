<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fmtRate, fmtSigned } from '../lib/format';
  import { i18n, t, type LangSetting, type MessageKey } from '../lib/i18n.svelte';
  import { theme, type ThemeSetting } from '../lib/theme.svelte';
  import Icon from './Icon.svelte';

  const THEMES: { id: ThemeSetting; icon: 'contrast' | 'sun' | 'moon'; label: MessageKey }[] = [
    { id: 'auto', icon: 'contrast', label: 'themeAuto' },
    { id: 'light', icon: 'sun', label: 'themeLight' },
    { id: 'dark', icon: 'moon', label: 'themeDark' },
  ];

  const MAX_OFFSET_MS = 10_000;
  const LANGS: { id: LangSetting; label: string }[] = [
    { id: 'auto', label: '' },
    { id: 'de', label: 'Deutsch' },
    { id: 'en', label: 'English' },
  ];

  const offsetMs = $derived(app.offsetB * 1000);
  const bothReady = $derived(app.tracks.A.ready && app.tracks.B.ready);

  function applyOffsetMs(ms: number) {
    const clamped = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, ms));
    // round to 1 µs to avoid floating-point noise
    app.setOffsetB(Math.round(clamped * 1000) / 1e6);
  }

  function setOffsetMs(input: HTMLInputElement) {
    const n = parseFloat(input.value.replace(',', '.').replace('−', '-'));
    if (Number.isFinite(n)) applyOffsetMs(n);
    else input.value = offsetMs.toFixed(2);
  }

  function close() {
    app.settingsOpen = false;
  }
</script>

{#if app.settingsOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <aside class="drawer" aria-label={t('settings')}>
    <header>
      <h2>{t('settings')}</h2>
      <button class="btn icon" onclick={close} aria-label={t('close')}><Icon name="close" size={16} /></button>
    </header>

    <section>
      <h3>{t('language')}</h3>
      <div class="seg" role="radiogroup" aria-label={t('language')}>
        {#each LANGS as l (l.id)}
          <button role="radio" aria-checked={i18n.setting === l.id} class:on={i18n.setting === l.id} onclick={() => i18n.set(l.id)}>
            {l.id === 'auto' ? t('languageAuto') : l.label}
          </button>
        {/each}
      </div>
      <div class="appearance">
        <span>{t('appearance')}</span>
        <div class="mini" role="radiogroup" aria-label={t('appearance')}>
          {#each THEMES as th (th.id)}
            <button
              role="radio"
              aria-checked={theme.setting === th.id}
              aria-label={t(th.label)}
              title={t(th.label)}
              class:on={theme.setting === th.id}
              onclick={() => theme.set(th.id)}
            >
              <Icon name={th.icon} size={15} />
            </button>
          {/each}
        </div>
      </div>
    </section>

    <section>
      <h3>{t('sectionSwitching')}</h3>
      <label class="field">
        <span>{t('crossfade')}</span>
        <input type="range" min="0" max="50" step="1" value={app.crossfadeMs} oninput={(e) => app.setCrossfade(+e.currentTarget.value)} />
        <span class="num val">{app.crossfadeMs} ms</span>
      </label>
      <p class="help">{t('crossfadeHelp')}</p>
      <button class="toggle" aria-pressed={app.levelMatch} onclick={() => app.setLevelMatch(!app.levelMatch)}>
        <span class="switch" class:on={app.levelMatch}></span>
        <span>
          <strong>{t('levelMatchLong')}</strong>
          <small>{t('levelMatchHelp')}</small>
        </span>
      </button>
    </section>

    <section>
      <h3>{t('sectionAlign')}</h3>
      <div class="offset">
        <input
          class="num"
          type="text"
          inputmode="decimal"
          value={offsetMs.toFixed(2)}
          onchange={(e) => setOffsetMs(e.currentTarget)}
          aria-label={t('offsetMs')}
        />
        <span class="unit">ms</span>
        <button class="btn" onclick={() => app.setOffsetB(0)} disabled={app.offsetB === 0}>{t('reset')}</button>
      </div>
      <div class="nudges">
        {#each [-10, -1, -0.1, 0.1, 1, 10] as d (d)}
          <button class="btn num" onclick={() => applyOffsetMs(offsetMs + d)}>{d > 0 ? '+' : '−'}{Math.abs(d)}</button>
        {/each}
      </div>
      <button class="btn wide" onclick={() => app.autoAlign(true)} disabled={!bothReady || app.aligning}>
        <Icon name="align" size={16} />
        {app.aligning ? t('aligning') : t('autoAlign')}
      </button>
      {#if app.align}
        <p class="help num">
          {t('alignFound', { ms: fmtSigned(app.align.offset * 1000, 'ms'), corr: app.align.correlation.toFixed(3) })}
          {app.align.applied ? t('alignApplied') : ''}
        </p>
      {/if}
      <p class="help">{t('alignHelp')}</p>
    </section>

    <section>
      <h3>{t('sectionOutput')}</h3>
      <div class="radios" role="radiogroup" aria-label={t('sectionOutput')}>
        <button class="radio" role="radio" aria-checked={app.outputMode === 'direct'} class:on={app.outputMode === 'direct'} onclick={() => app.setOutputMode('direct')}>
          <span class="dot"></span>
          <span><strong>{t('outputDirect')}</strong><small>{t('outputDirectHelp')}</small></span>
        </button>
        <button class="radio" role="radio" aria-checked={app.outputMode === 'element'} class:on={app.outputMode === 'element'} onclick={() => app.setOutputMode('element')}>
          <span class="dot"></span>
          <span>
            <strong>{t('outputElement')} <em>{t('experimental')}</em></strong>
            <small>{t('outputElementHelp')}</small>
          </span>
        </button>
      </div>
      {#if app.airplayAvailable}
        <button class="btn wide" onclick={() => app.showAirPlay()}><Icon name="airplay" size={16} /> {t('airplayPick')}</button>
      {/if}
      <p class="help">{t('outputHelp')}</p>
      <button class="btn wide" onclick={() => app.resetAudio()} disabled={!app.engine || app.rebuilding}>
        <Icon name="refresh" size={16} />
        {t('resetAudio')}
        {#if app.engine}<span class="num rate">{fmtRate(app.engine.sampleRate)}</span>{/if}
      </button>
      <p class="help">{t('resetAudioHelp')}</p>
    </section>

    <section class="about">
      <p>{t('privacyShort')}</p>
    </section>
  </aside>
{/if}

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid var(--line);
  }
  .seg button {
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 13px;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--panel-3);
    color: var(--text);
  }
  .appearance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: var(--muted);
  }
  .mini {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    background: var(--bg-2);
    border: 1px solid var(--line);
  }
  .mini button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 26px;
    border-radius: 6px;
    color: var(--muted);
  }
  .mini button:hover {
    color: var(--text);
  }
  .mini button.on {
    background: var(--panel-3);
    color: var(--text);
  }
  .rate {
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    z-index: 40;
    animation: fade 0.15s;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 100vw);
    z-index: 41;
    overflow-y: auto;
    background: var(--panel);
    border-left: 1px solid var(--line);
    padding: 0 20px calc(24px + var(--safe-bottom));
    animation: slidein 0.18s ease-out;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes slidein {
    from { transform: translateX(24px); opacity: 0; }
  }
  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    background: var(--panel);
    z-index: 1;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  section {
    padding: 16px 0;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }
  .field input {
    flex: 1;
  }
  .val {
    width: 48px;
    text-align: right;
    font-size: 13px;
  }
  .help {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }
  .toggle,
  .radio {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    text-align: left;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .toggle .switch {
    margin-top: 2px;
  }
  .toggle strong,
  .radio strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .toggle small,
  .radio small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.45;
  }
  .radio em {
    font-style: normal;
    font-weight: 400;
    color: var(--muted);
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .radio .dot {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    border-radius: 50%;
    border: 2px solid var(--line-2);
  }
  .radio.on {
    border-color: var(--line-2);
  }
  .radio.on .dot {
    border-color: var(--good);
    background: radial-gradient(circle, var(--good) 0 3px, transparent 4px);
  }
  .offset {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .offset input {
    width: 110px;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--bg-2);
    text-align: right;
  }
  .unit {
    color: var(--muted);
    font-size: 13px;
    margin-right: auto;
  }
  .nudges {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .nudges .btn {
    padding: 0;
    font-size: 12px;
  }
  .wide {
    width: 100%;
    height: 40px;
  }
  .about p {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
</style>
