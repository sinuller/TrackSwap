<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { SLOTS, type Slot } from '../engine/AudioEngine';
  import { fitCanvas, onFrame } from '../lib/ticker';
  import { t } from '../lib/i18n.svelte';
  import { canvasPalette } from '../lib/theme.svelte';

  const DB_MIN = -120;
  const DB_MAX = 0;
  const F_MIN = 20;

  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let source = $state<'live' | 'average'>('live');

  onMount(() => {
    const g = canvas.getContext('2d')!;
    const buffers: Partial<Record<Slot, Float32Array<ArrayBuffer>>> = {};

    return onFrame(() => {
      if (!width || !height) return;
      fitCanvas(canvas, width, height);
      const dpr = canvas.width / width;
      const W = canvas.width;
      const H = canvas.height;
      const padL = 34 * dpr;
      const padB = 18 * dpr;
      const plotW = W - padL - 8 * dpr;
      const plotH = H - padB - 8 * dpr;
      const top = 8 * dpr;
      const e = app.engine;
      const nyq = source === 'live' ? (e?.sampleRate ?? 48000) / 2 : maxAnalysisNyq();
      const fMax = Math.min(nyq, source === 'live' ? 24000 : nyq);
      const lf0 = Math.log10(F_MIN);
      const lf1 = Math.log10(fMax);
      const fx = (f: number) => padL + ((Math.log10(Math.max(F_MIN, f)) - lf0) / (lf1 - lf0)) * plotW;
      const dy = (db: number) => top + ((DB_MAX - Math.max(DB_MIN, Math.min(DB_MAX, db))) / (DB_MAX - DB_MIN)) * plotH;

      const p = canvasPalette();
      g.fillStyle = p.bg;
      g.fillRect(0, 0, W, H);

      // Grid
      g.font = `${10 * dpr}px ui-monospace, monospace`;
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      for (let db = DB_MIN; db <= DB_MAX; db += 20) {
        const y = Math.round(dy(db));
        g.fillStyle = p.grid;
        g.fillRect(padL, y, plotW, Math.max(1, dpr * 0.75));
        g.fillStyle = p.faint;
        g.fillText(`${db}`, padL - 6 * dpr, y);
      }
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 40000, 80000]) {
        if (f > fMax) break;
        const x = Math.round(fx(f));
        g.fillStyle = f === 1000 || f === 10000 || f === 100 ? p.gridStrong : p.grid;
        g.fillRect(x, top, Math.max(1, dpr * 0.75), plotH);
        g.fillStyle = p.faint;
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, top + plotH + 4 * dpr);
      }

      const visible = app.hidesIdentity ? [] : SLOTS.filter((s) => app.tracks[s].ready);
      // Draw the active source last (on top)
      visible.sort((a) => (a === app.active ? 1 : -1));

      for (const slot of visible) {
        const [r, gC, b] = slot === 'A' ? p.aRgb : p.bRgb;
        const isActive = slot === app.active;
        let data: Float32Array;
        let binHz: number;
        let offsetDb = 0;
        if (source === 'live') {
          if (!e) continue;
          const an = e.analyser(slot);
          let buf = buffers[slot];
          if (!buf || buf.length !== an.frequencyBinCount) buf = buffers[slot] = new Float32Array(an.frequencyBinCount);
          an.getFloatFrequencyData(buf);
          data = buf;
          binHz = e.sampleRate / an.fftSize;
        } else {
          const cut = app.tracks[slot].analysis?.cutoff;
          if (!cut) continue;
          data = cut.spectrumDb;
          binHz = (app.tracks[slot].analysisRate || 44100) / cut.fftSize;
          offsetDb = app.compensation[slot];
        }

        // Per pixel column: maximum of the bins it covers
        const path = new Path2D();
        let started = false;
        const x0 = Math.ceil(padL);
        const x1 = Math.floor(padL + plotW);
        const trackNyq = data.length * binHz;
        for (let x = x0; x <= x1; x++) {
          const fa = Math.pow(10, lf0 + ((x - padL) / plotW) * (lf1 - lf0));
          const fb = Math.pow(10, lf0 + ((x + 1 - padL) / plotW) * (lf1 - lf0));
          if (fa > trackNyq) break;
          const ka = Math.max(1, Math.floor(fa / binHz));
          const kb = Math.min(data.length - 1, Math.max(ka, Math.floor(fb / binHz)));
          let v = -Infinity;
          for (let k = ka; k <= kb; k++) if (data[k] > v) v = data[k];
          if (!Number.isFinite(v)) v = DB_MIN;
          const y = dy(v + offsetDb);
          if (!started) {
            path.moveTo(x, y);
            started = true;
          } else path.lineTo(x, y);
        }
        if (!started) continue;
        if (isActive) {
          const fill = new Path2D(path);
          fill.lineTo(x1, top + plotH);
          fill.lineTo(x0, top + plotH);
          fill.closePath();
          const grad = g.createLinearGradient(0, top, 0, top + plotH);
          grad.addColorStop(0, `rgba(${r},${gC},${b},0.28)`);
          grad.addColorStop(1, `rgba(${r},${gC},${b},0.02)`);
          g.fillStyle = grad;
          g.fill(fill);
        }
        g.strokeStyle = `rgba(${r},${gC},${b},${isActive ? 1 : 0.55})`;
        g.lineWidth = (isActive ? 1.6 : 1.1) * dpr;
        g.lineJoin = 'round';
        g.stroke(path);

        // Cutoff marker
        const cut = app.tracks[slot].analysis?.cutoff;
        if (cut && cut.cutoffHz > 0 && cut.cutoffHz < fMax * 0.99) {
          const x = Math.round(fx(cut.cutoffHz));
          g.fillStyle = `rgba(${r},${gC},${b},0.6)`;
          for (let y = top; y < top + plotH; y += 6 * dpr) g.fillRect(x, y, Math.max(1, dpr), 3 * dpr);
        }
      }

      if (app.hidesIdentity) {
        g.fillStyle = p.faint;
        g.font = `${13 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t('hiddenInBlind'), padL + plotW / 2, top + plotH / 2);
      }
    });
  });

  function maxAnalysisNyq(): number {
    let n = 22050;
    for (const s of SLOTS) {
      const r = app.tracks[s].analysisRate;
      if (app.tracks[s].analysis && r) n = Math.max(n, r / 2);
    }
    return n;
  }
</script>

<div class="spectrum">
  <div class="toolbar">
    <div class="seg" role="group" aria-label={t('spectrumSource')}>
      <button class:on={source === 'live'} aria-pressed={source === 'live'} onclick={() => (source = 'live')}>{t('spectrumLive')}</button>
      <button class:on={source === 'average'} aria-pressed={source === 'average'} onclick={() => (source = 'average')}>{t('spectrumAverage')}</button>
    </div>
    <span class="note">{source === 'live' ? t('spectrumLiveNote') : t('spectrumAverageNote')}</span>
  </div>
  <div class="plot" bind:clientWidth={width} bind:clientHeight={height}>
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .spectrum {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
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
    padding: 4px 10px;
    border-radius: 6px;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--panel-3);
    color: var(--text);
  }
  .note {
    font-size: 12px;
    color: var(--faint);
  }
  .plot {
    position: relative;
    height: 300px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  @media (max-width: 720px) {
    .plot {
      height: 230px;
    }
  }
</style>
