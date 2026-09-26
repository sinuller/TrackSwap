<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { SLOTS, type Slot } from '../engine/AudioEngine';
  import { t } from '../lib/i18n.svelte';

  const available = $derived(SLOTS.filter((s) => app.tracks[s].meta?.lyrics));
  let chosen = $state<Slot | null>(null);
  const shown = $derived(chosen && available.includes(chosen) ? chosen : (available[0] ?? null));
</script>

{#if shown}
  <div class="lyrics">
    <div class="head">
      <span class="label">{t('lyrics')}</span>
      {#if available.length > 1}
        <div class="seg">
          {#each available as s (s)}
            <button class:on={shown === s} onclick={() => (chosen = s)}>{s}</button>
          {/each}
        </div>
      {:else}
        <span class="from">{t('lyricsFrom', { slot: shown })}</span>
      {/if}
    </div>
    <pre>{app.tracks[shown].meta?.lyrics}</pre>
  </div>
{/if}

<style>
  .lyrics {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .from {
    font-size: 12px;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    background: var(--bg-2);
    border: 1px solid var(--line);
  }
  .seg button {
    font-size: 12px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 6px;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--panel-3);
    color: var(--text);
  }
  pre {
    margin: 0;
    max-height: 420px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-2);
  }
</style>
