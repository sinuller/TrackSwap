<script lang="ts">
  type Name =
    | 'play' | 'pause' | 'loop' | 'settings' | 'help' | 'close' | 'upload' | 'volume' | 'volume-off'
    | 'airplay' | 'align' | 'swap' | 'eye' | 'eye-off' | 'music' | 'warn' | 'check' | 'info' | 'bracket-l' | 'bracket-r' | 'refresh'
    | 'sun' | 'moon' | 'contrast';

  let { name, size = 18 }: { name: Name; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'play'}
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <rect x="6" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'loop'}
    <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
  {:else if name === 'settings'}
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
  {:else if name === 'close'}
    <path d="M18 6L6 18M6 6l12 12" />
  {:else if name === 'upload'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
  {:else if name === 'volume'}
    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  {:else if name === 'volume-off'}
    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" /><path d="M23 9l-6 6M17 9l6 6" />
  {:else if name === 'airplay'}
    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><path d="M12 15l5 6H7l5-6z" />
  {:else if name === 'align'}
    <path d="M12 3v18" /><path d="M4 8h5M4 16h5M15 8h5M15 16h5" /><path d="M7 5l-3 3 3 3M17 13l3 3-3 3" />
  {:else if name === 'swap'}
    <path d="M16 3l4 4-4 4" /><path d="M20 7H4" /><path d="M8 21l-4-4 4-4" /><path d="M4 17h16" />
  {:else if name === 'eye'}
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  {:else if name === 'eye-off'}
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M1 1l22 22" />
  {:else if name === 'music'}
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  {:else if name === 'warn'}
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" />
  {:else if name === 'check'}
    <path d="M20 6L9 17l-5-5" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  {:else if name === 'bracket-l'}
    <path d="M9 4H5v16h4" /><path d="M13 12h6" />
  {:else if name === 'bracket-r'}
    <path d="M15 4h4v16h-4" /><path d="M5 12h6" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  {:else if name === 'moon'}
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  {:else if name === 'contrast'}
    <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  {:else if name === 'refresh'}
    <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  {/if}
</svg>
