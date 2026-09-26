<script lang="ts">
  import { app, type Mode } from '../lib/app.svelte';
  import { t, type MessageKey } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  const MODES: { id: Mode; label: MessageKey; short: MessageKey; title: MessageKey }[] = [
    { id: 'compare', label: 'modeCompare', short: 'modeCompareShort', title: 'modeCompareTitle' },
    { id: 'blind', label: 'modeBlind', short: 'modeBlindShort', title: 'modeBlindTitle' },
    { id: 'abx', label: 'modeAbx', short: 'modeAbxShort', title: 'modeAbxTitle' },
  ];
</script>

<header class="header">
  <div class="brand">
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--panel)" stroke="var(--line)" />
      <rect x="7" y="9" width="4" height="14" rx="2" fill="var(--a)" />
      <rect x="14" y="5" width="4" height="22" rx="2" fill="var(--text)" />
      <rect x="21" y="11" width="4" height="10" rx="2" fill="var(--b)" />
    </svg>
    <span class="name">Track<span>Swap</span></span>
  </div>

  <nav class="modes" aria-label={t('modeNav')}>
    {#each MODES as m (m.id)}
      <button class:on={app.mode === m.id} title={t(m.title)} onclick={() => app.setMode(m.id)} aria-pressed={app.mode === m.id}>
        <span class="long">{t(m.label)}</span><span class="short">{t(m.short)}</span>
      </button>
    {/each}
  </nav>

  <div class="tools">
    {#if app.airplayAvailable}
      <button class="btn icon" title={t('airplay')} aria-label={t('airplay')} onclick={() => app.showAirPlay()}><Icon name="airplay" size={17} /></button>
    {/if}
    <button class="btn icon" title={t('helpButton')} aria-label={t('helpButton')} onclick={() => (app.helpOpen = true)}><Icon name="help" size={17} /></button>
    <button class="btn icon" title={t('settingsButton')} aria-label={t('settingsButton')} onclick={() => (app.settingsOpen = true)}><Icon name="settings" size={17} /></button>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 60px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }
  .logo {
    width: 30px;
    height: 30px;
    flex: none;
  }
  .name {
    font-weight: 700;
    font-size: 18px;
    letter-spacing: -0.02em;
  }
  .name span {
    color: var(--muted);
    font-weight: 600;
  }
  .modes {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .modes button {
    padding: 6px 14px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    transition: background 0.15s, color 0.15s;
  }
  .modes button:hover {
    color: var(--text);
  }
  .modes button.on {
    background: var(--panel-3);
    color: var(--text);
    box-shadow: 0 1px 0 var(--highlight) inset;
  }
  .short {
    display: none;
  }
  .tools {
    display: flex;
    gap: 6px;
    flex: 1;
    justify-content: flex-end;
  }
  @media (max-width: 640px) {
    .header {
      gap: 10px;
      height: 56px;
    }
    .name {
      display: none;
    }
    .brand {
      flex: none;
    }
    .modes {
      flex: 1;
    }
    .modes button {
      flex: 1;
      padding: 6px 8px;
    }
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
    .tools {
      flex: none;
    }
  }
</style>
