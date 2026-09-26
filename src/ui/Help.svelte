<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { t, type MessageKey } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  const STEPS: MessageKey[] = ['helpStep1', 'helpStep2', 'helpStep3', 'helpStep4', 'helpStep5', 'helpStep6'];
  const KEYS = $derived<[string, MessageKey][]>([
    [t('keySpace'), 'scPlay'],
    ['1 · 2 · 3', 'scSelect'],
    ['A · B · X · Y', 'scSelectDirect'],
    [`T  ${t('keyOr')}  ↑ ↓`, 'scToggle'],
    ['← →', 'scSeek'],
    ['L', 'scLoop'],
    ['[  ]', 'scLoopPoints'],
    [t('keyHome'), 'scHome'],
    ['?', 'scHelp'],
  ]);

  let dialog = $state<HTMLDivElement>();
  $effect(() => {
    if (app.helpOpen) dialog?.focus();
  });
</script>

{#if app.helpOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={() => (app.helpOpen = false)}>
    <div
      class="dialog panel"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={t('helpTitle')}
      bind:this={dialog}
      onclick={(e) => e.stopPropagation()}
    >
      <header>
        <h2>{t('helpTitle')}</h2>
        <button class="btn icon" onclick={() => (app.helpOpen = false)} aria-label={t('close')}><Icon name="close" size={16} /></button>
      </header>
      <ol class="steps">
        {#each STEPS as step (step)}
          <li>{t(step)}</li>
        {/each}
      </ol>
      <h3>{t('shortcuts')}</h3>
      <dl>
        {#each KEYS as [k, v] (v)}
          <dt><kbd>{k}</kbd></dt>
          <dd>{t(v)}</dd>
        {/each}
      </dl>
      <p class="privacy">{t('privacy')}</p>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--backdrop);
  }
  .dialog:focus {
    outline: none;
  }
  .dialog {
    width: min(560px, 100%);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    padding: 4px 22px 20px;
    background: var(--panel);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .steps {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    color: var(--text-2);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    white-space: nowrap;
  }
  dd {
    margin: 0;
    color: var(--text-2);
  }
  kbd {
    font-family: var(--mono);
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 5px;
    background: var(--panel-3);
    border: 1px solid var(--line-2);
  }
  .privacy {
    margin: 18px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
