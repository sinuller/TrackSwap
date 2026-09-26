<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { SLOTS, type Slot } from '../engine/AudioEngine';
  import type { Spectrogram } from '../analysis/types';
  import { fitCanvas, onFrame } from '../lib/ticker';
  import { INFERNO } from '../lib/colormap';
  import { fmtTime } from '../lib/format';
  import { i18n, t } from '../lib/i18n.svelte';

  let { kind }: { kind: 'wave' | 'spectrogram' } = $props();

  const COLORS: Record<Slot, string> = { A: '#ffb020', B: '#38c8f4' };
  const NEUTRAL = '#9aa3b5';
  const RULER = 20;

  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);

  interface Lane { slot: Slot; neutral: boolean }
  const lanes = $derived.by<Lane[]>(() => {
    if (app.hidesIdentity) {
      const s: Slot = app.tracks.A.ready ? 'A' : 'B';
      return app.tracks[s].ready ? [{ slot: s, neutral: true }] : [];
    }
    return SLOTS.filter((s) => app.tracks[s].ready).map((slot) => ({ slot, neutral: false }));
  });

  // Offscreen layer with the static content (waveform/spectrogram, axes)
  const layer = document.createElement('canvas');
  const specCache = new WeakMap<Spectrogram, HTMLCanvasElement>();
  let dpr = 1;

  function specImage(spec: Spectrogram): HTMLCanvasElement {
    let img = specCache.get(spec);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = spec.columns;
    img.height = spec.bins;
    const ctx = img.getContext('2d')!;
    const data = ctx.createImageData(spec.columns, spec.bins);
    const px = new Uint32Array(data.data.buffer);
    const { columns, bins } = spec;
    for (let c = 0; c < columns; c++) {
      const off = c * bins;
      for (let k = 0; k < bins; k++) px[(bins - 1 - k) * columns + c] = INFERNO[spec.data[off + k]];
    }
    ctx.putImageData(data, 0, 0);
    specCache.set(spec, img);
    return img;
  }

  function timeStep(duration: number, widthCss: number): number {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    for (const s of steps) if ((s / duration) * widthCss >= 64) return s;
    return 600;
  }

  function renderStatic(): void {
    const W = canvas.width;
    const H = canvas.height;
    layer.width = W;
    layer.height = H;
    const g = layer.getContext('2d')!;
    g.fillStyle = '#0f1216';
    g.fillRect(0, 0, W, H);
    const ruler = RULER * dpr;
    const areaH = H - ruler;
    const dur = app.duration;

    if (!lanes.length || !(dur > 0)) {
      g.fillStyle = '#5a6373';
      g.font = `${13 * dpr}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t('timelineEmpty'), W / 2, H / 2);
      return;
    }

    const laneH = areaH / lanes.length;
    const maxNyq = Math.max(
      ...lanes.map((l) => (app.tracks[l.slot].analysis?.spectrogram.sampleRate ?? app.tracks[l.slot].analysisRate ?? 44100) / 2),
    );

    lanes.forEach((lane, i) => {
      const y0 = Math.round(i * laneH);
      const h = Math.round((i + 1) * laneH) - y0;
      if (kind === 'wave') drawWave(g, lane, y0, h, W, dur);
      else drawSpec(g, lane, y0, h, W, dur, maxNyq);
      if (i > 0) {
        g.fillStyle = '#262c36';
        g.fillRect(0, y0, W, Math.max(1, dpr));
      }
      if (!lane.neutral) {
        // Lane label
        const s = 18 * dpr;
        g.fillStyle = COLORS[lane.slot];
        g.beginPath();
        g.roundRect(6 * dpr, y0 + 6 * dpr, s, s, 4 * dpr);
        g.fill();
        g.fillStyle = '#0b0d10';
        g.font = `800 ${11 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(lane.slot, 6 * dpr + s / 2, y0 + 6 * dpr + s / 2 + dpr * 0.5);
      }
    });

    // Time ruler
    g.fillStyle = '#14171c';
    g.fillRect(0, areaH, W, ruler);
    g.fillStyle = '#262c36';
    g.fillRect(0, areaH, W, Math.max(1, dpr));
    const step = timeStep(dur, W / dpr);
    g.font = `${10 * dpr}px ui-monospace, monospace`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    for (let t = 0; t <= dur; t += step) {
      const x = Math.round((t / dur) * W);
      g.fillStyle = '#323a47';
      g.fillRect(x, areaH, Math.max(1, dpr), 5 * dpr);
      g.fillStyle = '#8690a2';
      if (x < W - 30 * dpr) g.fillText(fmtTime(t), x + 4 * dpr, areaH + ruler / 2 + dpr);
    }
  }

  function drawWave(g: CanvasRenderingContext2D, lane: Lane, y0: number, h: number, W: number, dur: number): void {
    const tr = app.tracks[lane.slot];
    const peaks = tr.analysis?.peaks;
    const color = lane.neutral ? NEUTRAL : COLORS[lane.slot];
    const mid = y0 + h / 2;
    const amp = (h / 2) * 0.9;
    g.fillStyle = '#1a1e25';
    g.fillRect(0, Math.round(mid), W, Math.max(1, dpr));
    if (!peaks) {
      g.fillStyle = '#5a6373';
      g.font = `${12 * dpr}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t('waveformPending'), W / 2, mid - 12 * dpr);
      return;
    }
    const n = peaks.length / 3;
    const trackDur = tr.duration;
    const off = lane.slot === 'B' ? app.offsetB : 0;
    const peakPath = new Path2D();
    const rmsPath = new Path2D();
    for (let x = 0; x < W; x++) {
      const t0 = (x / W) * dur + off;
      const t1 = ((x + 1) / W) * dur + off;
      if (t1 <= 0 || t0 >= trackDur) continue;
      const b0 = Math.max(0, Math.floor((Math.max(0, t0) / trackDur) * n));
      const b1 = Math.min(n, Math.max(b0 + 1, Math.ceil((Math.min(trackDur, t1) / trackDur) * n)));
      let mn = 0, mx = 0, rms = 0;
      for (let b = b0; b < b1; b++) {
        const lo = peaks[b * 3], hi = peaks[b * 3 + 1], r = peaks[b * 3 + 2];
        if (lo < mn) mn = lo;
        if (hi > mx) mx = hi;
        if (r > rms) rms = r;
      }
      const top = mid - Math.min(1, mx) * amp;
      const bot = mid - Math.max(-1, mn) * amp;
      peakPath.rect(x, top, 1, Math.max(1, bot - top));
      const rh = Math.min(1, rms) * amp;
      rmsPath.rect(x, mid - rh, 1, Math.max(1, 2 * rh));
    }
    g.globalAlpha = 0.42;
    g.fillStyle = color;
    g.fill(peakPath);
    g.globalAlpha = 0.95;
    g.fill(rmsPath);
    g.globalAlpha = 1;
  }

  function drawSpec(g: CanvasRenderingContext2D, lane: Lane, y0: number, h: number, W: number, dur: number, maxNyq: number): void {
    const tr = app.tracks[lane.slot];
    const spec = tr.analysis?.spectrogram;
    if (!spec) {
      g.fillStyle = '#5a6373';
      g.font = `${12 * dpr}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t('spectrogramPending'), W / 2, y0 + h / 2);
      return;
    }
    const nyq = spec.sampleRate / 2;
    const imgH = h * (nyq / maxNyq);
    const top = y0 + h - imgH;
    if (imgH < h - 1) {
      // Hatch the area above this file's Nyquist frequency
      g.save();
      g.beginPath();
      g.rect(0, y0, W, h - imgH);
      g.clip();
      g.fillStyle = '#0b0d10';
      g.fillRect(0, y0, W, h - imgH);
      g.strokeStyle = '#1a1e25';
      g.lineWidth = dpr;
      for (let x = -h; x < W; x += 10 * dpr) {
        g.beginPath();
        g.moveTo(x, y0 + h);
        g.lineTo(x + h, y0);
        g.stroke();
      }
      g.restore();
    }
    const trackDur = tr.duration;
    const off = lane.slot === 'B' ? app.offsetB : 0;
    const cols = spec.columns;
    let sx = (off / trackDur) * cols;
    let sw = (dur / trackDur) * cols;
    let dx = 0;
    let dw = W;
    if (sx < 0) {
      const cut = (-sx / sw) * W;
      dx += cut;
      dw -= cut;
      sw += sx;
      sx = 0;
    }
    if (sx + sw > cols) {
      const over = sx + sw - cols;
      dw -= (over / sw) * W;
      sw -= over;
    }
    if (sw > 0 && dw > 0) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(specImage(spec), sx, 0, sw, spec.bins, dx, top, dw, imgH);
    }

    // Frequency axis
    const stepHz = maxNyq > 30000 ? 10000 : 5000;
    g.font = `${10 * dpr}px ui-monospace, monospace`;
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    for (let f = stepHz; f < maxNyq; f += stepHz) {
      const y = y0 + h - (f / maxNyq) * h;
      if (y < y0 + 10 * dpr) continue;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, Math.round(y), W, Math.max(1, dpr * 0.5));
      g.fillStyle = 'rgba(232,235,241,0.7)';
      g.fillText(`${f / 1000}k`, W - 6 * dpr, y);
    }

    // Estimated cutoff
    const cut = tr.analysis?.cutoff;
    if (cut && cut.cutoffHz > 0 && cut.cutoffHz < nyq * 0.985) {
      const y = Math.round(y0 + h - (cut.cutoffHz / maxNyq) * h);
      const color = lane.neutral ? NEUTRAL : COLORS[lane.slot];
      g.strokeStyle = color;
      g.lineWidth = 1.5 * dpr;
      g.setLineDash([6 * dpr, 4 * dpr]);
      g.beginPath();
      g.moveTo(34 * dpr, y);
      g.lineTo(W - 40 * dpr, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = color;
      g.textAlign = 'left';
      g.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      g.fillText(t('cutoffLabel', { khz: (cut.cutoffHz / 1000).toFixed(1) }), 34 * dpr, y - 9 * dpr);
    }
  }

  // --------------------------------------------------------------- Interaction

  type Drag = { type: 'pending' | 'create' | 'start' | 'end'; x0: number; t0: number } | null;
  let drag: Drag = null;
  let hoverX: number | null = null;
  let cursor = $state('crosshair');

  const xToTime = (xCss: number) => Math.max(0, Math.min(app.duration, (xCss / width) * app.duration));
  const timeToX = (t: number) => (app.duration > 0 ? (t / app.duration) * width : 0);

  function handleAt(x: number, pointerType: string): 'start' | 'end' | null {
    const loop = app.loop;
    if (!loop) return null;
    const tol = pointerType === 'touch' ? 16 : 7;
    const xs = timeToX(loop.start);
    const xe = timeToX(loop.end);
    if (Math.abs(x - xe) <= tol) return 'end';
    if (Math.abs(x - xs) <= tol) return 'start';
    return null;
  }

  function localX(e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(r.width, e.clientX - r.left));
  }

  function onDown(e: PointerEvent) {
    if (!(app.duration > 0) || e.button > 0) return;
    const x = localX(e);
    canvas.setPointerCapture(e.pointerId);
    const h = handleAt(x, e.pointerType);
    drag = { type: h ?? 'pending', x0: x, t0: xToTime(x) };
  }

  function onMove(e: PointerEvent) {
    const x = localX(e);
    hoverX = e.pointerType === 'mouse' ? x : null;
    if (!drag) {
      cursor = handleAt(x, e.pointerType) ? 'ew-resize' : 'crosshair';
      return;
    }
    const time = xToTime(x);
    if (drag.type === 'pending' && Math.abs(x - drag.x0) > 6) drag.type = 'create';
    if (drag.type === 'create') {
      app.setLoop({ start: Math.min(drag.t0, time), end: Math.max(drag.t0, time) }, false);
    } else if ((drag.type === 'start' || drag.type === 'end') && app.loop) {
      const other = drag.type === 'start' ? app.loop.end : app.loop.start;
      app.setLoop({ start: Math.min(other, time), end: Math.max(other, time) });
      if ((drag.type === 'start' && time > other) || (drag.type === 'end' && time < other)) {
        drag.type = drag.type === 'start' ? 'end' : 'start';
      }
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (d.type === 'pending') app.seek(d.t0);
    else if (d.type === 'create') {
      const loop = app.loop;
      if (!loop || loop.end - loop.start < 0.1) app.clearLoop();
      else {
        app.setLoop(loop, true);
        if (app.position < loop.start || app.position >= loop.end) app.seek(loop.start);
      }
    }
  }

  // --------------------------------------------------------------- Drawing

  $effect(() => {
    // Dependencies of the static layer
    void [width, height, lanes, app.duration, app.offsetB, kind, i18n.lang];
    for (const s of SLOTS) void [app.tracks[s].analysis, app.tracks[s].duration];
    if (!canvas || !width || !height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    fitCanvas(canvas, width, height);
    renderStatic();
  });

  onMount(() => {
    const g = canvas.getContext('2d')!;
    return onFrame(() => {
      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H || layer.width !== W) return;
      g.clearRect(0, 0, W, H);
      g.drawImage(layer, 0, 0);
      const dur = app.duration;
      if (!(dur > 0) || !lanes.length) return;
      const areaH = H - RULER * dpr;
      const laneH = areaH / lanes.length;

      // Dim the inactive lane
      if (lanes.length > 1) {
        lanes.forEach((lane, i) => {
          if (lane.slot !== app.active) {
            g.fillStyle = 'rgba(11,13,16,0.5)';
            g.fillRect(0, i * laneH, W, laneH);
          }
        });
      }

      // Loop region
      const loop = app.loop;
      if (loop) {
        const x0 = (loop.start / dur) * W;
        const x1 = (loop.end / dur) * W;
        const on = app.loopEnabled;
        g.fillStyle = on ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.05)';
        g.fillRect(x0, 0, x1 - x0, areaH);
        g.fillStyle = on ? '#4ade80' : '#8690a2';
        g.fillRect(x0 - dpr, 0, 2 * dpr, areaH);
        g.fillRect(x1 - dpr, 0, 2 * dpr, areaH);
        const hw = 7 * dpr;
        for (const x of [x0, x1]) {
          g.beginPath();
          g.moveTo(x - hw, 0);
          g.lineTo(x + hw, 0);
          g.lineTo(x, hw * 1.2);
          g.closePath();
          g.fill();
        }
      }

      // Hover
      if (hoverX !== null && !drag) {
        const x = hoverX * dpr;
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x, 0, Math.max(1, dpr), areaH);
        const label = fmtTime((hoverX / width) * dur, true);
        g.font = `${10 * dpr}px ui-monospace, monospace`;
        const tw = g.measureText(label).width + 10 * dpr;
        const lx = Math.min(W - tw - 2 * dpr, x + 6 * dpr);
        g.fillStyle = 'rgba(11,13,16,0.85)';
        g.fillRect(lx, areaH - 20 * dpr, tw, 16 * dpr);
        g.fillStyle = '#e8ebf1';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(label, lx + 5 * dpr, areaH - 12 * dpr);
      }

      // Playhead
      const px = Math.round((app.position / dur) * W);
      g.fillStyle = '#ffffff';
      g.fillRect(px - dpr * 0.75, 0, 1.5 * dpr, H);
      g.beginPath();
      g.moveTo(px - 5 * dpr, H);
      g.lineTo(px + 5 * dpr, H);
      g.lineTo(px, H - 6 * dpr);
      g.closePath();
      g.fill();
    });
  });
</script>

<div class="timeline {kind}" bind:clientWidth={width} bind:clientHeight={height}>
  <canvas
    bind:this={canvas}
    style:cursor
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onpointerleave={() => (hoverX = null)}
    aria-label={t('timelineLabel')}
  ></canvas>
</div>

<style>
  .timeline {
    position: relative;
    width: 100%;
    height: 230px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #0f1216;
  }
  .timeline.spectrogram {
    height: 340px;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: pan-y;
  }
  @media (max-width: 720px) {
    .timeline {
      height: 180px;
    }
    .timeline.spectrogram {
      height: 260px;
    }
  }
</style>
