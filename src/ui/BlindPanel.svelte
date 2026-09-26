<script lang="ts">
  import { app, type BlindKey } from '../lib/app.svelte';
  import { qualityLabel } from '../lib/format';
  import type { Slot } from '../engine/AudioEngine';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  const b = $derived(app.blind);
  const desc = (s: Slot) => {
    const m = app.tracks[s].meta;
    return m ? `${m.fileName} · ${qualityLabel(m)}` : s;
  };
  const tally = $derived({ A: b.rounds.filter((r) => r === 'A').length, B: b.rounds.filter((r) => r === 'B').length });
</script>

<section class="panel mode-panel">
  <header>
    <div>
      <h2><Icon name="eye-off" size={18} /> {t('blindTitle')}</h2>
      <p>{t('blindIntro')}</p>
    </div>
  </header>

  {#if !b.revealed}
    <div class="pick">
      {#each ['X', 'Y'] as const as key (key)}
        <button class="btn choice" class:on={b.pick === key} aria-pressed={b.pick === key} onclick={() => app.blindPick(key as BlindKey)}>
          {#if b.pick === key}<Icon name="check" size={16} />{/if}
          {t('blindSoundsBetter', { key })}
        </button>
      {/each}
    </div>
    <div class="row">
      <button class="btn primary" onclick={() => app.blindReveal()}>
        <Icon name="eye" size={16} /> {t('blindReveal')}
      </button>
      <span class="muted">{b.pick ? t('blindYourPick', { key: b.pick }) : t('blindPickOptional')}</span>
    </div>
  {:else}
    <div class="reveal">
      {#each ['X', 'Y'] as const as key (key)}
        {@const slot = b.mapping[key]}
        <div class="map {slot.toLowerCase()}" class:picked={b.pick === key}>
          <span class="k">{key}</span>
          <span class="eq">=</span>
          <span class="tag">{slot}</span>
          <span class="d">{desc(slot)}</span>
          {#if b.pick === key}<span class="yours">{t('blindYours')}</span>{/if}
        </div>
      {/each}
    </div>
    <div class="row">
      <button class="btn primary" onclick={() => app.blindNewRound()}>
        <Icon name="refresh" size={16} /> {t('blindNewRound')}
      </button>
      {#if b.rounds.length}
        <span class="muted num">{t('blindTally', { a: tally.A, b: tally.B, n: b.rounds.length })}</span>
      {/if}
    </div>
  {/if}
</section>

<style>
  .mode-panel {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 16px;
  }
  h2 :global(svg) {
    color: var(--x);
  }
  p {
    margin: 0;
    font-size: 13px;
    color: var(--text-2);
    max-width: 70ch;
  }
  .pick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .choice {
    height: 48px;
    font-size: 14px;
  }
  .choice.on {
    color: var(--x);
    border-color: var(--x);
    background: var(--x-soft);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .muted {
    font-size: 12px;
    color: var(--muted);
  }
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .map {
    --c: var(--a);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    border: 1px solid var(--line);
    min-width: 0;
  }
  .map.b {
    --c: var(--b);
  }
  .map.picked {
    border-color: var(--x);
  }
  .k {
    font-weight: 800;
    font-size: 18px;
    color: var(--x);
  }
  .eq {
    color: var(--faint);
  }
  .tag {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--c);
    color: var(--on-accent);
    font-weight: 800;
    font-size: 12px;
    flex: none;
  }
  .d {
    min-width: 0;
    font-size: 13px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .yours {
    margin-left: auto;
    font-size: 11px;
    color: var(--x);
    white-space: nowrap;
  }
</style>
