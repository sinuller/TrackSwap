<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { abxPValue } from '../lib/stats';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  const trials = $derived(app.abx.trials);
  const n = $derived(trials.length);
  const correct = $derived(trials.filter((t) => t.answer === t.x).length);
  const done = $derived(n >= app.abx.target);
  const p = $derived(abxPValue(correct, n));
  const TARGETS = [8, 12, 16, 20, 25];
  const fmtP = (v: number) => (v < 0.001 ? '< 0.001' : v.toFixed(3));

  function setTarget(v: number) {
    app.abx.target = v;
    app.abxReset();
  }
</script>

<section class="panel mode-panel">
  <header>
    <h2><Icon name="swap" size={18} /> {t('abxTitle')}</h2>
    <p>{t('abxIntro')}</p>
  </header>

  <div class="progress">
    <div class="meta num">
      <span>{t('abxTrial', { i: Math.min(n + 1, app.abx.target), n: app.abx.target })}</span>
      <span>{t('abxCorrect', { k: correct, n })}</span>
    </div>
    <div class="dots">
      {#each Array(app.abx.target) as _, i (i)}
        <span class="d" class:ok={trials[i] && trials[i].answer === trials[i].x} class:fail={trials[i] && trials[i].answer !== trials[i].x}></span>
      {/each}
    </div>
  </div>

  {#if !done}
    <div class="answer">
      <button class="btn ans a" onclick={() => app.abxAnswer('A')}>{t('abxAnswer', { slot: 'A' })}</button>
      <button class="btn ans b" onclick={() => app.abxAnswer('B')}>{t('abxAnswer', { slot: 'B' })}</button>
    </div>
  {:else}
    <div class="result" class:sig={p < 0.05}>
      <div class="big num">{correct} / {n}</div>
      <div>
        <div class="verdict">
          {#if p < 0.01}
            {t('abxVerdictStrong')}
          {:else if p < 0.05}
            {t('abxVerdictSig')}
          {:else}
            {t('abxVerdictNone')}
          {/if}
        </div>
        <div class="pval num">p = {fmtP(p)} {t('abxPExplain')}</div>
      </div>
    </div>
  {/if}

  <div class="row">
    <button class="btn" onclick={() => app.abxReset()}><Icon name="refresh" size={15} /> {t('abxRestart')}</button>
    <label class="target">
      {t('abxTrials')}
      <select value={app.abx.target} onchange={(e) => setTarget(+(e.currentTarget as HTMLSelectElement).value)}>
        {#each TARGETS as t (t)}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    {#if n > 0 && !done}
      <span class="muted num">{t('abxCurrentP', { p: fmtP(p) })}</span>
    {/if}
  </div>
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
  .progress .meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .d {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
  }
  .d.ok {
    background: var(--good);
  }
  .d.fail {
    background: var(--bad);
  }
  .answer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .ans {
    height: 52px;
    font-size: 15px;
  }
  .ans.a:hover {
    color: var(--a);
    border-color: var(--a);
  }
  .ans.b:hover {
    color: var(--b);
    border-color: var(--b);
  }
  .result {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .result.sig {
    border-color: var(--good);
    background: var(--good-soft);
  }
  .big {
    font-size: 28px;
    font-weight: 700;
  }
  .verdict {
    font-weight: 600;
  }
  .pval {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  select {
    height: 34px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .muted {
    font-size: 12px;
    color: var(--muted);
  }
</style>
