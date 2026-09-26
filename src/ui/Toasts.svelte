<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as toast (toast.id)}
    <div class="toast {toast.level}" role={toast.level === 'error' ? 'alert' : 'status'}>
      <Icon name={toast.level === 'info' ? 'info' : 'warn'} size={16} />
      <span class="text">{toast.text}</span>
      {#if toast.action}
        <button
          class="act"
          onclick={() => {
            toast.action?.run();
            app.dismissToast(toast.id);
          }}>{toast.action.label}</button
        >
      {/if}
      <button class="x" onclick={() => app.dismissToast(toast.id)} aria-label={t('close')}><Icon name="close" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(20px + var(--safe-bottom));
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(520px, calc(100vw - 24px));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 12px;
    border-radius: 10px;
    background: var(--panel-3);
    border: 1px solid var(--line-2);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.7);
    font-size: 13px;
    animation: up 0.18s ease-out;
  }
  @keyframes up {
    from { transform: translateY(8px); opacity: 0; }
  }
  .toast :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .info :global(svg:first-child) {
    color: var(--b);
  }
  .warn :global(svg:first-child) {
    color: var(--warn);
  }
  .error :global(svg:first-child) {
    color: var(--bad);
  }
  .text {
    flex: 1;
    line-height: 1.45;
  }
  .act {
    font-size: 13px;
    font-weight: 600;
    color: var(--b);
    white-space: nowrap;
  }
  .x {
    color: var(--muted);
  }
  @media (max-width: 900px) {
    .toasts {
      bottom: calc(108px + var(--safe-bottom));
    }
  }
</style>
