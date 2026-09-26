<script lang="ts">
  import { onMount } from 'svelte';
  import { app, type View } from './lib/app.svelte';
  import { onFrame } from './lib/ticker';
  import { i18n, t, type MessageKey } from './lib/i18n.svelte';
  import Header from './ui/Header.svelte';
  import TrackCard from './ui/TrackCard.svelte';
  import ABSwitch from './ui/ABSwitch.svelte';
  import Transport from './ui/Transport.svelte';
  import Timeline from './ui/Timeline.svelte';
  import SpectrumView from './ui/SpectrumView.svelte';
  import CompareTable from './ui/CompareTable.svelte';
  import Lyrics from './ui/Lyrics.svelte';
  import BlindPanel from './ui/BlindPanel.svelte';
  import AbxPanel from './ui/AbxPanel.svelte';
  import Settings from './ui/Settings.svelte';
  import Help from './ui/Help.svelte';
  import Toasts from './ui/Toasts.svelte';
  import Icon from './ui/Icon.svelte';

  const VIEWS: { id: View; label: MessageKey }[] = [
    { id: 'wave', label: 'viewWave' },
    { id: 'spectrogram', label: 'viewSpectrogram' },
    { id: 'spectrum', label: 'viewSpectrum' },
  ];
  const FEATURES: [MessageKey, MessageKey][] = [
    ['featureSyncTitle', 'featureSync'],
    ['featureFairTitle', 'featureFair'],
    ['featureQualityTitle', 'featureQuality'],
    ['featureBlindTitle', 'featureBlind'],
  ];

  const anyLoaded = $derived(app.tracks.A.status !== 'empty' || app.tracks.B.status !== 'empty');
  const anonymous = $derived(app.mode === 'blind' && !app.blind.revealed);
  const hasLyrics = $derived(!!(app.tracks.A.meta?.lyrics || app.tracks.B.meta?.lyrics));
  let dragging = $state(false);
  let dragDepth = 0;

  onMount(() => onFrame((now) => app.tick(now)));

  $effect(() => {
    document.documentElement.lang = i18n.lang;
  });

  function isTyping(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      app.settingsOpen = false;
      app.helpOpen = false;
      return;
    }
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const m = app.mode;
    let handled = true;
    switch (k) {
      case ' ':
        app.togglePlay();
        break;
      case '1':
      case 'a':
        if (m === 'compare') app.select('A');
        else if (m === 'blind') k === '1' && app.blindSelect('X');
        else app.abxListen('A');
        break;
      case '2':
      case 'b':
        if (m === 'compare') app.select('B');
        else if (m === 'blind') k === '2' && app.blindSelect('Y');
        else app.abxListen('B');
        break;
      case '3':
      case 'x':
        if (m === 'abx') app.abxListen('X');
        else if (m === 'blind' && k === 'x') app.blindSelect('X');
        break;
      case 'y':
        if (m === 'blind') app.blindSelect('Y');
        break;
      case 't':
      case 'ArrowUp':
      case 'ArrowDown':
        app.cycle(1);
        break;
      case 'ArrowLeft':
        app.seek(app.position - (e.shiftKey ? 1 : 5));
        break;
      case 'ArrowRight':
        app.seek(app.position + (e.shiftKey ? 1 : 5));
        break;
      case 'l':
        app.toggleLoop();
        break;
      case '[':
        app.setLoopPoint('start');
        break;
      case ']':
        app.setLoopPoint('end');
        break;
      case 'Home':
        app.seek(app.loopEnabled && app.loop ? app.loop.start : 0);
        break;
      case '?':
        app.helpOpen = !app.helpOpen;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }

  function hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }
</script>

<svelte:window
  onkeydown={onKey}
  ondragenter={(e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    dragging = true;
  }}
  ondragleave={() => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dragging = false;
  }}
  ondragover={(e) => hasFiles(e) && e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    dragDepth = 0;
    dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) app.loadFiles(files);
  }}
/>

<div class="app">
  <Header />

  <main>
    <section class="top" class:anon={anonymous}>
      {#if anonymous}
        {#each ['X', 'Y'] as const as key (key)}
          <div class="anon-card panel" class:on={app.blind.selected === key}>
            <span class="q">?</span>
            <div>
              <div class="t">{t('anonSource', { key })}</div>
              <div class="s">{t('anonHidden')}</div>
            </div>
          </div>
        {/each}
      {:else}
        <TrackCard slot="A" />
        <TrackCard slot="B" />
      {/if}
      <div class="center">
        <ABSwitch />
      </div>
    </section>

    {#if app.mode === 'blind'}
      <BlindPanel />
    {:else if app.mode === 'abx'}
      <AbxPanel />
    {/if}

    {#if anyLoaded}
      <section class="panel deck">
        <Transport />
        <div class="views">
          <div class="tabs" role="tablist">
            {#each VIEWS as v (v.id)}
              <button
                role="tab"
                aria-selected={app.view === v.id}
                class:on={app.view === v.id}
                disabled={app.hidesIdentity && v.id !== 'wave'}
                onclick={() => (app.view = v.id)}>{t(v.label)}</button
              >
            {/each}
          </div>
          {#if app.view === 'spectrogram' && !app.hidesIdentity}
            <span class="tip">{t('tipSpectrogram')}</span>
          {:else if app.view === 'wave'}
            <span class="tip">{t('tipWave')}</span>
          {/if}
        </div>
        {#if app.view === 'spectrum' && !app.hidesIdentity}
          <SpectrumView />
        {:else if app.view === 'spectrogram' && !app.hidesIdentity}
          <Timeline kind="spectrogram" />
        {:else}
          <Timeline kind="wave" />
        {/if}
      </section>

      {#if !anonymous}
        <section class="details" class:with-lyrics={hasLyrics}>
          <div class="panel box">
            <h2 class="label">{t('qualityComparison')}</h2>
            <CompareTable />
          </div>
          {#if hasLyrics}
            <div class="panel box">
              <Lyrics />
            </div>
          {/if}
        </section>
      {/if}
    {:else}
      <section class="intro">
        <div class="features">
          {#each FEATURES as [title, text] (title)}
            <div><strong>{t(title)}</strong><span>{t(text)}</span></div>
          {/each}
        </div>
        <p class="privacy"><Icon name="check" size={14} /> {t('privacyLocal')}</p>
      </section>
    {/if}
  </main>

  <footer>
    {t('footer')} · <button class="link" onclick={() => (app.helpOpen = true)}>{t('footerHelp')}</button>
  </footer>
</div>

<div class="mobile-bar">
  <ABSwitch compact />
</div>

{#if dragging}
  <div class="drop-overlay">
    <div>
      <Icon name="upload" size={32} />
      <strong>{t('dropFiles')}</strong>
      <span>{t('dropFilesHint')}</span>
    </div>
  </div>
{/if}

<Toasts />
<Settings />
<Help />

<style>
  .app {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 20px;
    padding-left: max(20px, env(safe-area-inset-left));
    padding-right: max(20px, env(safe-area-inset-right));
  }
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 24px;
  }

  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px minmax(0, 1fr);
    grid-template-areas: 'a center b';
    gap: 16px;
    align-items: stretch;
  }
  .top > :global(:nth-child(1)) {
    grid-area: a;
  }
  .top > :global(:nth-child(2)) {
    grid-area: b;
  }
  .center {
    grid-area: center;
    display: flex;
    align-items: center;
  }

  .anon-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px;
    min-height: 120px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .anon-card.on {
    border-color: var(--x);
    box-shadow: 0 0 0 1px var(--x), 0 0 28px -6px rgba(180, 140, 255, 0.35);
  }
  .anon-card .q {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    background: var(--x-soft);
    color: var(--x);
    font-size: 26px;
    font-weight: 800;
  }
  .anon-card .t {
    font-weight: 700;
    font-size: 17px;
  }
  .anon-card .s {
    font-size: 13px;
    color: var(--muted);
  }

  .deck {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .views {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .tabs {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid var(--line);
  }
  .tabs button {
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
  }
  .tabs button.on {
    background: var(--panel-3);
    color: var(--text);
  }
  .tip {
    font-size: 12px;
    color: var(--faint);
  }

  .details {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .details.with-lyrics {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
  .box {
    padding: 16px 18px 18px;
    min-width: 0;
  }
  .box h2 {
    margin: 0 0 4px;
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0 12px;
  }
  .features {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .features div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--bg-2);
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .features span {
    color: var(--muted);
    line-height: 1.5;
  }
  .privacy {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .privacy :global(svg) {
    color: var(--good);
  }

  footer {
    padding: 20px 0 28px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--faint);
  }
  .link {
    color: var(--muted);
    text-decoration: underline;
    font-size: 12px;
  }

  .mobile-bar {
    display: none;
  }

  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: rgba(11, 13, 16, 0.8);
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .drop-overlay div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 36px 48px;
    border-radius: 18px;
    border: 2px dashed var(--line-2);
    text-align: center;
  }
  .drop-overlay strong {
    font-size: 18px;
  }
  .drop-overlay span {
    color: var(--muted);
    font-size: 13px;
  }

  /* Tablet */
  @media (max-width: 1080px) {
    .top {
      grid-template-columns: minmax(0, 1fr) 280px minmax(0, 1fr);
    }
    .features {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Mobile: source switch as a fixed bar at the bottom */
  @media (max-width: 900px) {
    .app {
      padding: 0 12px;
      padding-left: max(12px, env(safe-area-inset-left));
      padding-right: max(12px, env(safe-area-inset-right));
    }
    main {
      padding-bottom: calc(110px + var(--safe-bottom));
      gap: 12px;
    }
    .top {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: 'a b';
      gap: 12px;
    }
    .center {
      display: none;
    }
    .details.with-lyrics {
      grid-template-columns: minmax(0, 1fr);
    }
    .deck {
      padding: 12px;
    }
    .tip {
      display: none;
    }
    footer {
      padding-bottom: calc(120px + var(--safe-bottom));
    }
    .mobile-bar {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      padding: 10px 12px calc(10px + var(--safe-bottom));
      background: rgba(15, 18, 22, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid var(--line);
    }
  }

  @media (max-width: 640px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'a' 'b';
    }
    .top.anon {
      grid-template-columns: 1fr 1fr;
      grid-template-areas: 'a b';
    }
    .anon-card {
      min-height: 0;
      padding: 12px;
      gap: 10px;
    }
    .anon-card .q {
      width: 40px;
      height: 40px;
      font-size: 20px;
    }
    .features {
      grid-template-columns: 1fr;
    }
  }
</style>
