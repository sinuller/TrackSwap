<script lang="ts">
  import type { Slot } from '../engine/AudioEngine';
  import { app, AUDIO_ACCEPT } from '../lib/app.svelte';
  import { fmtBytes, fmtSigned, fmtTime, qualityLabel } from '../lib/format';
  import { FFMPEG_DOWNLOAD_MB } from '../engine/decode';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  let { slot }: { slot: Slot } = $props();

  const tr = $derived(app.tracks[slot]);
  const meta = $derived(tr.meta);
  const isActive = $derived(app.mode === 'compare' && app.active === slot && tr.ready);
  const comp = $derived(app.compensation[slot]);

  let input: HTMLInputElement;
  let dragOver = $state(false);

  function pick(e?: Event) {
    e?.stopPropagation();
    input.click();
  }

  function onInput() {
    const files = Array.from(input.files ?? []);
    if (files.length) app.loadFiles(files, slot);
    input.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) app.loadFiles(files, slot);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragOver = true;
  }

  function selectThis() {
    if (tr.ready && app.mode === 'compare') app.select(slot);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="card slot-{slot.toLowerCase()}"
  class:active={isActive}
  class:drag={dragOver}
  class:filled={tr.status !== 'empty'}
  ondragover={onDragOver}
  ondragleave={() => (dragOver = false)}
  ondrop={onDrop}
  onclick={selectThis}
>
  <input bind:this={input} type="file" accept={AUDIO_ACCEPT} multiple class="sr-only" onchange={onInput} tabindex="-1" />

  {#if tr.status === 'empty'}
    <button class="dropzone" onclick={pick}>
      <span class="letter">{slot}</span>
      <span class="dz-title">{t('loadTrack', { slot })}</span>
      <span class="dz-sub">{t('dropHint')} <u>{t('pick')}</u></span>
      <span class="dz-formats">MP3 · WAV · FLAC · AAC · M4A · OGG · AIFF · ALAC …</span>
    </button>
  {:else}
    <div class="head">
      <div class="cover">
        {#if meta?.coverUrl}
          <img src={meta.coverUrl} alt={t('cover')} />
        {:else}
          <Icon name="music" size={26} />
        {/if}
        <span class="letter small">{slot}</span>
      </div>
      <div class="titles">
        <div class="title" title={meta?.title ?? tr.file?.name}>{meta?.title ?? tr.file?.name ?? '…'}</div>
        {#if meta?.artist}<div class="artist">{meta.artist}</div>{/if}
        {#if meta?.album}<div class="album">{meta.album}{meta.year ? ` · ${meta.year}` : ''}</div>{/if}
      </div>
      <div class="actions">
        <button class="btn icon" title={t('chooseOther')} aria-label={t('chooseOther')} onclick={pick}><Icon name="upload" size={16} /></button>
        <button class="btn icon" title={t('remove')} aria-label={t('remove')} onclick={(e) => { e.stopPropagation(); app.unload(slot); }}><Icon name="close" size={16} /></button>
      </div>
    </div>

    {#if tr.status === 'loading'}
      <div class="progress"><div class="bar"></div></div>
      <div class="stage">{tr.stage ? t(tr.stage) : ''}</div>
    {:else if tr.status === 'needs-ffmpeg'}
      <div class="notice warn">
        <Icon name="warn" size={16} />
        <div>
          {t('ffmpegNotice', { mb: FFMPEG_DOWNLOAD_MB })}
          <div class="row">
            <button class="btn primary" onclick={(e) => { e.stopPropagation(); if (tr.file) app.loadFile(slot, tr.file, true); }}>{t('ffmpegLoad')}</button>
            <button class="btn" onclick={(e) => { e.stopPropagation(); app.unload(slot); }}>{t('cancel')}</button>
          </div>
        </div>
      </div>
    {:else if tr.status === 'error'}
      <div class="notice bad">
        <Icon name="warn" size={16} />
        <div>{t('loadFailed', { error: tr.error })}</div>
      </div>
    {:else if meta}
      <div class="badges">
        <span class="badge q">{qualityLabel(meta)}</span>
        {#if meta.lossless === true}
          <span class="badge good">{t('lossless')}</span>
        {:else if meta.lossless === false}
          <span class="badge lossy">{t('lossy')}</span>
        {/if}
        {#if comp < -0.05}
          <span class="badge comp" title={t('levelMatchBadge')}>{fmtSigned(comp)}</span>
        {/if}
        {#if tr.decoder && tr.decoder !== 'native'}
          <span class="badge dim" title={t('decodedWith')}>{tr.decoder === 'aiff' ? t('aiffDecoder') : 'ffmpeg'}</span>
        {/if}
      </div>
      <div class="file">
        <span class="fname" title={meta.fileName}>{meta.fileName}</span>
        <span class="num">{fmtBytes(meta.fileSize)} · {fmtTime(tr.duration)}</span>
      </div>
      {#if app.rebuilding}
        <div class="analyzing"><span class="dot"></span>{t('stageRebuild')}</div>
      {:else if tr.analyzing}
        <div class="analyzing"><span class="dot"></span>{t(tr.stage || 'analyzing')}</div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .card {
    --c: var(--a);
    --c-soft: var(--a-soft);
    --c-glow: var(--a-glow);
    position: relative;
    min-width: 0;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--line);
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .slot-b {
    --c: var(--b);
    --c-soft: var(--b-soft);
    --c-glow: var(--b-glow);
  }
  .card.filled {
    padding: 14px;
    cursor: default;
  }
  .card.active {
    border-color: var(--c);
    box-shadow: 0 0 0 1px var(--c), 0 0 28px -6px var(--c-glow);
  }
  .card.drag {
    border-color: var(--c);
    background: var(--c-soft);
  }

  .dropzone {
    width: 100%;
    min-height: 156px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 18px 12px;
    border-radius: var(--radius);
    border: 1.5px dashed var(--line-2);
    color: var(--text-2);
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone:hover {
    border-color: var(--c);
    background: var(--c-soft);
  }
  .dz-title {
    font-weight: 600;
    color: var(--text);
    margin-top: 6px;
  }
  .dz-sub {
    font-size: 13px;
    color: var(--muted);
  }
  .dz-formats {
    font-size: 11px;
    color: var(--faint);
    margin-top: 6px;
  }

  .letter {
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--c);
    color: #0b0d10;
    font-weight: 800;
    font-size: 20px;
  }
  .letter.small {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 22px;
    height: 22px;
    font-size: 12px;
    border-radius: 6px;
    box-shadow: 0 0 0 3px var(--panel);
  }

  .head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .cover {
    position: relative;
    flex: none;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    background: var(--panel-3);
    display: grid;
    place-items: center;
    color: var(--faint);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
  }
  .titles {
    min-width: 0;
    flex: 1;
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist,
  .album {
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .album {
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .actions .btn {
    width: 30px;
    height: 30px;
    background: transparent;
    border-color: transparent;
  }
  .actions .btn:hover {
    border-color: var(--line);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .badge {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--panel-3);
    color: var(--text-2);
    white-space: nowrap;
  }
  .badge.q {
    background: var(--c-soft);
    color: var(--c);
  }
  .badge.good {
    background: rgba(74, 222, 128, 0.12);
    color: var(--good);
  }
  .badge.lossy {
    background: rgba(251, 191, 36, 0.12);
    color: var(--warn);
  }
  .badge.comp {
    font-family: var(--mono);
    font-weight: 500;
  }
  .badge.dim {
    font-weight: 500;
    color: var(--muted);
  }

  .file {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .fname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file .num {
    flex: none;
  }

  .progress {
    margin-top: 14px;
    height: 3px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .bar {
    width: 35%;
    height: 100%;
    background: var(--c);
    border-radius: 2px;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(300%); }
  }
  .stage {
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .analyzing {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from { opacity: 0.25; }
    to { opacity: 1; }
  }

  .notice {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-2);
  }
  .notice :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .notice.warn {
    background: rgba(251, 191, 36, 0.08);
    color: var(--text);
  }
  .notice.warn :global(svg) {
    color: var(--warn);
  }
  .notice.bad {
    background: rgba(248, 113, 113, 0.08);
  }
  .notice.bad :global(svg) {
    color: var(--bad);
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
</style>
