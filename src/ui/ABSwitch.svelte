<script lang="ts">
  import { app, type AbxKey, type BlindKey } from '../lib/app.svelte';
  import { qualityLabel } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import type { Slot } from '../engine/AudioEngine';
  import Icon from './Icon.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  const canPlay = $derived(app.tracks.A.ready || app.tracks.B.ready);

  function sub(slot: Slot): string {
    const m = app.tracks[slot].meta;
    if (!app.tracks[slot].ready || !m) return app.tracks[slot].status === 'loading' ? t('loading') : t('empty');
    return qualityLabel(m);
  }
</script>

{#snippet playBtn()}
  <button class="play" class:playing={app.playing} onclick={() => app.togglePlay()} disabled={!canPlay} aria-label={app.playing ? t('pause') : t('play')} title={t('playTitle')}>
    <Icon name={app.playing ? 'pause' : 'play'} size={compact ? 24 : 28} />
  </button>
{/snippet}

<div class="switch-wrap" class:compact>
  {#if app.mode === 'compare'}
    <div class="sources three">
      <button class="src a" class:on={app.active === 'A' && app.tracks.A.ready} disabled={!app.tracks.A.ready} onclick={() => app.select('A')} aria-pressed={app.active === 'A'}>
        <span class="big">A</span>
        {#if !compact}<span class="sub">{sub('A')}</span>{/if}
        <kbd>1</kbd>
      </button>
      {@render playBtn()}
      <button class="src b" class:on={app.active === 'B' && app.tracks.B.ready} disabled={!app.tracks.B.ready} onclick={() => app.select('B')} aria-pressed={app.active === 'B'}>
        <span class="big">B</span>
        {#if !compact}<span class="sub">{sub('B')}</span>{/if}
        <kbd>2</kbd>
      </button>
    </div>
  {:else if app.mode === 'blind'}
    <div class="sources three">
      {#each ['X', 'Y'] as const as key, i (key)}
        {#if i === 1}{@render playBtn()}{/if}
        <button
          class="src x"
          class:on={app.blind.selected === key}
          class:a={app.blind.revealed && app.blind.mapping[key] === 'A'}
          class:b={app.blind.revealed && app.blind.mapping[key] === 'B'}
          onclick={() => app.blindSelect(key as BlindKey)}
          aria-pressed={app.blind.selected === key}
        >
          <span class="big">{key}</span>
          {#if !compact}<span class="sub">{app.blind.revealed ? `= ${app.blind.mapping[key]}` : t('source')}</span>{/if}
          <kbd>{i + 1}</kbd>
        </button>
      {/each}
    </div>
  {:else}
    <div class="sources four">
      {@render playBtn()}
      {#each ['A', 'B', 'X'] as const as key, i (key)}
        <button
          class="src"
          class:a={key === 'A'}
          class:b={key === 'B'}
          class:x={key === 'X'}
          class:on={app.abx.listening === key}
          onclick={() => app.abxListen(key as AbxKey)}
          aria-pressed={app.abx.listening === key}
        >
          <span class="big">{key}</span>
          {#if !compact}<span class="sub">{key === 'X' ? t('unknown') : t('known')}</span>{/if}
          <kbd>{i + 1}</kbd>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .switch-wrap {
    width: 100%;
  }
  .sources {
    display: grid;
    gap: 10px;
    align-items: stretch;
  }
  .sources.three {
    grid-template-columns: 1fr auto 1fr;
  }
  .sources.four {
    grid-template-columns: auto 1fr 1fr 1fr;
  }

  .src {
    --c: var(--text);
    --c-soft: var(--glass);
    --c-glow: var(--glass-strong);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 104px;
    padding: 10px 8px;
    border-radius: 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--muted);
    transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s;
    user-select: none;
    -webkit-user-select: none;
  }
  .src.a {
    --c: var(--a);
    --c-soft: var(--a-soft);
    --c-glow: var(--a-glow);
  }
  .src.b {
    --c: var(--b);
    --c-soft: var(--b-soft);
    --c-glow: var(--b-glow);
  }
  .src.x:not(.a):not(.b) {
    --c: var(--x);
    --c-soft: var(--x-soft);
    --c-glow: var(--x-glow);
  }
  .src:hover:not(:disabled) {
    color: var(--c);
    border-color: var(--line-2);
  }
  .src:active:not(:disabled) {
    transform: scale(0.97);
  }
  .src.on {
    color: var(--c);
    background: var(--c-soft);
    border-color: var(--c);
    box-shadow: 0 0 0 1px var(--c), 0 0 36px -8px var(--c-glow);
  }
  .big {
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .sub {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .src.on .sub {
    color: var(--text-2);
  }
  kbd {
    position: absolute;
    top: 8px;
    right: 10px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--faint);
  }

  .play {
    width: 72px;
    align-self: center;
    aspect-ratio: 1;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: var(--bg);
    transition: transform 0.08s, background 0.15s;
    box-shadow: 0 6px 24px -8px var(--primary-glow);
  }
  .play:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .play:active:not(:disabled) {
    transform: scale(0.94);
  }
  .play :global(svg) {
    margin-left: 2px;
  }
  .play.playing :global(svg) {
    margin-left: 0;
  }

  .compact .src {
    min-height: 64px;
    border-radius: 12px;
  }
  .compact .big {
    font-size: 30px;
  }
  .compact .play {
    width: 60px;
  }
  .compact kbd {
    display: none;
  }
</style>
