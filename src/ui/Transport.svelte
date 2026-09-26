<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fmtSigned, fmtTime } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';
  import Meter from './Meter.svelte';

  const hasAudio = $derived(app.tracks.A.ready || app.tracks.B.ready);
  const loopLen = $derived(app.loop ? app.loop.end - app.loop.start : 0);
  const lufsDiff = $derived.by(() => {
    const a = app.tracks.A.analysis?.loudness.integrated;
    const b = app.tracks.B.analysis?.loudness.integrated;
    return a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
  });
  let muted = $state(false);
  let lastVol = 0.9;

  function toggleMute() {
    if (muted) {
      app.setVolume(lastVol || 0.9);
      muted = false;
    } else {
      lastVol = app.volume;
      app.setVolume(0);
      muted = true;
    }
  }
</script>

<div class="transport">
  <div class="time num" aria-label={t('position')}>
    <span class="pos">{fmtTime(app.position, true)}</span>
    <span class="dur">/ {fmtTime(app.duration)}</span>
  </div>

  <div class="group loop">
    <button class="btn icon" title={t('loopStartTitle')} aria-label={t('loopStartTitle')} onclick={() => app.setLoopPoint('start')} disabled={!hasAudio}><Icon name="bracket-l" size={16} /></button>
    <button class="btn loopbtn" class:on={app.loopEnabled} title={t('loopTitle')} aria-pressed={app.loopEnabled} onclick={() => app.toggleLoop()} disabled={!hasAudio}>
      <Icon name="loop" size={16} />
      <span class="num">{app.loop ? `${fmtTime(app.loop.start, true)}–${fmtTime(app.loop.end, true)}` : t('loop')}</span>
    </button>
    <button class="btn icon" title={t('loopEndTitle')} aria-label={t('loopEndTitle')} onclick={() => app.setLoopPoint('end')} disabled={!hasAudio}><Icon name="bracket-r" size={16} /></button>
    {#if app.loop}
      <button class="btn icon ghost" title={t('loopRemove')} aria-label={t('loopRemove')} onclick={() => app.clearLoop()}><Icon name="close" size={14} /></button>
      <span class="hint num">{loopLen.toFixed(1)} s</span>
    {/if}
  </div>

  <button
    class="btn match"
    class:on={app.levelMatch}
    title={t('levelMatchTitle')}
    aria-pressed={app.levelMatch}
    onclick={() => app.setLevelMatch(!app.levelMatch)}
  >
    <span class="switch" class:on={app.levelMatch}></span>
    {t('levelMatch')}
    {#if lufsDiff !== null && !app.hidesIdentity}
      <span class="num diff">Δ {Math.abs(lufsDiff).toFixed(1)} LU</span>
    {/if}
  </button>

  <div class="group vol">
    <button class="btn icon ghost" onclick={toggleMute} title={t('mute')} aria-label={t('mute')}>
      <Icon name={muted || app.volume === 0 ? 'volume-off' : 'volume'} size={16} />
    </button>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={app.volume}
      oninput={(e) => {
        muted = false;
        app.setVolume(+(e.currentTarget as HTMLInputElement).value);
      }}
      aria-label={t('volume')}
    />
    <div class="meter-wrap"><Meter /></div>
  </div>

  {#if app.offsetB !== 0 && !app.hidesIdentity}
    <span class="offset num" title={t('offsetTitle')}>B {fmtSigned(app.offsetB * 1000, 'ms')}</span>
  {/if}
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 10px 16px;
    flex-wrap: wrap;
  }
  .time {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 128px;
  }
  .pos {
    font-size: 22px;
    font-weight: 600;
    color: var(--text);
  }
  .dur {
    font-size: 13px;
    color: var(--muted);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .loopbtn .num {
    font-size: 12px;
  }
  .loopbtn.on {
    color: var(--good);
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(74, 222, 128, 0.08);
  }
  .ghost {
    background: transparent;
    border-color: transparent;
  }
  .hint {
    font-size: 11px;
    color: var(--muted);
    margin-left: 2px;
  }
  .match {
    gap: 8px;
  }
  .diff {
    font-size: 11px;
    color: var(--muted);
  }
  .vol {
    margin-left: auto;
    gap: 8px;
  }
  .vol input {
    width: 90px;
  }
  .meter-wrap {
    width: 130px;
  }
  .offset {
    font-size: 11px;
    color: var(--muted);
  }

  @media (max-width: 720px) {
    .transport {
      gap: 8px 10px;
    }
    .time {
      width: 100%;
      justify-content: space-between;
    }
    .vol {
      margin-left: 0;
      width: 100%;
    }
    .vol input {
      flex: 1;
      width: auto;
    }
    .meter-wrap {
      width: 110px;
    }
  }
</style>
