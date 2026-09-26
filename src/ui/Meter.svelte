<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { onFrame } from '../lib/ticker';
  import { t } from '../lib/i18n.svelte';

  const FLOOR = -60;
  let barL: HTMLDivElement;
  let barR: HTMLDivElement;
  let holdL: HTMLDivElement;
  let holdR: HTMLDivElement;
  let peakText = $state('−∞');

  onMount(() => {
    let buf: Float32Array<ArrayBuffer> | null = null;
    const hold = [FLOOR, FLOOR];
    const holdAt = [0, 0];
    const level = [FLOOR, FLOOR];
    let lastText = 0;

    const frac = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100));
    const pct = (db: number) => `${frac(db)}%`;
    const clip = (db: number) => `inset(0 ${100 - frac(db)}% 0 0)`;

    return onFrame((now) => {
      const e = app.engine;
      if (!e) return;
      const analysers = [e.meterL, e.meterR];
      if (!buf || buf.length !== e.meterL.fftSize) buf = new Float32Array(e.meterL.fftSize);
      for (let c = 0; c < 2; c++) {
        analysers[c].getFloatTimeDomainData(buf);
        let pk = 0;
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > pk) pk = a;
        }
        const db = pk > 0 ? 20 * Math.log10(pk) : -Infinity;
        // Fast attack, slow release
        level[c] = db > level[c] ? db : Math.max(FLOOR, level[c] - 0.9);
        if (db > hold[c] || now - holdAt[c] > 1200) {
          hold[c] = Math.max(FLOOR, db);
          holdAt[c] = now;
        }
      }
      barL.style.clipPath = clip(level[0]);
      barR.style.clipPath = clip(level[1]);
      holdL.style.left = pct(hold[0]);
      holdR.style.left = pct(hold[1]);
      if (now - lastText > 250) {
        lastText = now;
        const cur = Math.max(hold[0], hold[1]);
        peakText = cur <= FLOOR ? '−∞' : cur.toFixed(1).replace('-', '−');
      }
    });
  });
</script>

<div class="meter" title={t('meterTitle')}>
  <div class="ch">
    <div class="track"><div class="fill" bind:this={barL}></div><div class="hold" bind:this={holdL}></div></div>
    <div class="track"><div class="fill" bind:this={barR}></div><div class="hold" bind:this={holdR}></div></div>
  </div>
  <span class="val num">{peakText}</span>
</div>

<style>
  .meter {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .ch {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 60px;
  }
  .track {
    position: relative;
    height: 5px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 100%;
    clip-path: inset(0 100% 0 0);
    background: linear-gradient(90deg, #22c55e 0%, #4ade80 70%, #facc15 88%, #f87171 97%);
  }
  .hold {
    position: absolute;
    top: 0;
    width: 2px;
    height: 100%;
    background: var(--text);
    opacity: 0.7;
  }
  .val {
    width: 40px;
    text-align: right;
    font-size: 11px;
    color: var(--muted);
  }
</style>
