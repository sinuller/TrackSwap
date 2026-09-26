<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { SLOTS, type Slot } from '../engine/AudioEngine';
  import { fmtBytes, fmtChannels, fmtDb, fmtKbps, fmtKHz, fmtRate, fmtSigned, fmtTime, shortCodec } from '../lib/format';
  import { trackHints, type Hint } from '../lib/quality';
  import { t, type MessageKey } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  type Better = Slot | null;
  interface Row { label: MessageKey; v: Record<Slot, string>; better?: Better; title?: MessageKey }
  interface Group { name: MessageKey; rows: Row[] }

  function cmp(a: number | undefined, b: number | undefined, higherIsBetter = true, minDiff = 0): Better {
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a - b) <= minDiff) return null;
    return (a > b) === higherIsBetter ? 'A' : 'B';
  }

  const groups = $derived.by<Group[]>(() => {
    const T = app.tracks;
    const m = (s: Slot) => T[s].meta;
    const an = (s: Slot) => T[s].analysis;
    const both = <X,>(fn: (s: Slot) => X) => ({ A: fn('A'), B: fn('B') });
    const str = (fn: (s: Slot) => string | undefined) => both((s) => (T[s].status === 'empty' ? '' : fn(s) ?? '–'));
    const pending = (s: Slot) => (T[s].analyzing ? '…' : '–');

    const bitrate = (s: Slot) => {
      const meta = m(s);
      if (!meta) return undefined;
      const br = meta.bitrate ?? (T[s].duration ? (meta.fileSize * 8) / T[s].duration : undefined);
      if (!br) return undefined;
      return `${meta.lossless ? '≈ ' : ''}${fmtKbps(br)}${meta.codecProfile ? ` (${meta.codecProfile})` : ''}`;
    };
    const bitsLabel = (s: Slot) => {
      const meta = m(s);
      const eff = an(s)?.effectiveBits;
      if (!meta?.bitsPerSample) return meta?.lossless === false ? t('naLossy') : undefined;
      if (eff && eff < meta.bitsPerSample && eff <= 24) return t('bitsEffective', { n: meta.bitsPerSample, eff });
      return t('bits', { n: meta.bitsPerSample });
    };
    const effBits = (s: Slot) => {
      const meta = m(s);
      if (!meta?.bitsPerSample) return undefined;
      const eff = an(s)?.effectiveBits;
      return eff && eff < meta.bitsPerSample ? eff : meta.bitsPerSample;
    };
    const L = (s: Slot) => an(s)?.loudness;
    const cutoff = (s: Slot) => an(s)?.cutoff;
    const decoderName = { native: t('decoderBrowser'), aiff: t('decoderAiff'), ffmpeg: t('decoderFfmpeg') };
    const bothLossy = m('A')?.lossless === false && m('B')?.lossless === false;
    const losslessDiffers =
      m('A')?.lossless !== undefined && m('B')?.lossless !== undefined && m('A')?.lossless !== m('B')?.lossless;

    // "better" markers are only set where a higher/lower value is unambiguously preferable
    return [
      {
        name: 'groupFile',
        rows: [
          { label: 'rowFileName', v: str((s) => m(s)?.fileName) },
          { label: 'rowSize', v: str((s) => (m(s) ? fmtBytes(m(s)!.fileSize) : undefined)) },
          { label: 'rowDuration', v: str((s) => (T[s].duration ? fmtTime(T[s].duration, true) : undefined)) },
        ],
      },
      {
        name: 'groupFormat',
        rows: [
          { label: 'rowFormat', v: str((s) => (m(s) ? shortCodec(m(s)!) : undefined)) },
          { label: 'rowContainer', v: str((s) => m(s)?.container) },
          { label: 'rowCodec', v: str((s) => m(s)?.codec) },
          { label: 'rowEncoder', v: str((s) => m(s)?.encoder) },
          {
            label: 'rowCompression',
            v: str((s) => (m(s)?.lossless === undefined ? undefined : m(s)!.lossless ? t('lossless') : t('lossy'))),
            better: losslessDiffers ? (m('A')!.lossless ? 'A' : 'B') : null,
          },
          { label: 'rowBitrate', v: str(bitrate), better: bothLossy ? cmp(m('A')?.bitrate, m('B')?.bitrate, true, 2000) : null },
          {
            label: 'rowSampleRate',
            v: str((s) => (m(s)?.sampleRate ? fmtRate(m(s)!.sampleRate) : T[s].analysisRate ? fmtRate(T[s].analysisRate) : undefined)),
            // 44.1 vs 48 kHz is not a quality difference – only mark hi-res vs. standard
            better: cmp(m('A')?.sampleRate, m('B')?.sampleRate, true, 20000),
          },
          { label: 'rowBitDepth', v: str(bitsLabel), better: cmp(effBits('A'), effBits('B')) },
          { label: 'rowChannels', v: str((s) => fmtChannels(m(s)?.channels)) },
          { label: 'rowDecoder', v: str((s) => (T[s].decoder ? decoderName[T[s].decoder!] : undefined)) },
        ],
      },
      {
        name: 'groupLoudness',
        rows: [
          { label: 'rowIntegrated', v: str((s) => (L(s) ? fmtDb(L(s)!.integrated, 'LUFS') : pending(s))) },
          { label: 'rowRange', v: str((s) => (L(s) ? fmtDb(L(s)!.range, 'LU') : pending(s))) },
          {
            label: 'rowPlr',
            v: str((s) => (L(s) ? fmtDb(L(s)!.plr, 'LU') : pending(s))),
            better: cmp(L('A')?.plr, L('B')?.plr, true, 0.5),
            title: 'rowPlrTitle',
          },
          { label: 'rowTruePeak', v: str((s) => (L(s) ? fmtDb(L(s)!.truePeak, 'dBTP') : pending(s))) },
          { label: 'rowSamplePeak', v: str((s) => (L(s) ? fmtDb(L(s)!.samplePeak, 'dBFS') : pending(s))) },
          { label: 'rowShortTermMax', v: str((s) => (L(s) ? fmtDb(L(s)!.shortTermMax, 'LUFS') : pending(s))) },
          { label: 'rowRms', v: str((s) => (L(s) ? fmtDb(L(s)!.rms, 'dBFS') : pending(s))) },
          { label: 'rowClipping', v: str((s) => (L(s) ? `${L(s)!.clipEvents}×` : pending(s))), better: cmp(L('A')?.clipEvents, L('B')?.clipEvents, false) },
          { label: 'rowLevelMatch', v: str((s) => (T[s].analysis ? (app.levelMatch ? fmtSigned(app.compensation[s]) : t('off')) : pending(s))) },
          { label: 'rowReplayGain', v: str((s) => (m(s)?.replayGain !== undefined ? fmtSigned(m(s)!.replayGain!) : undefined)) },
        ],
      },
      {
        name: 'groupSpectrum',
        rows: [
          {
            label: 'rowCutoff',
            v: str((s) => (cutoff(s) ? (cutoff(s)!.cutoffHz ? `≈ ${fmtKHz(cutoff(s)!.cutoffHz)}` : '–') : pending(s))),
            better: cmp(cutoff('A')?.cutoffHz, cutoff('B')?.cutoffHz, true, 600),
          },
          {
            label: 'rowCharacter',
            v: str((s) => (cutoff(s) ? (cutoff(s)!.sharp ? t('sharpDrop', { db: cutoff(s)!.dropDb.toFixed(0) }) : t('naturalRolloff')) : pending(s))),
          },
        ],
      },
    ];
  });

  const hints = $derived.by(() => {
    const out: (Hint & { slot?: Slot })[] = [];
    for (const s of SLOTS) {
      const tr = app.tracks[s];
      for (const h of trackHints(tr.meta, tr.analysis, tr.analysisRate)) out.push({ ...h, slot: s });
    }
    const A = app.tracks.A, B = app.tracks.B;
    if (A.ready && B.ready) {
      const d = Math.abs(A.duration - (B.duration - app.offsetB));
      if (d > 0.5) out.push({ level: 'info', text: t('hintLength', { s: d.toFixed(1) }) });
      const ra = A.meta?.sampleRate, rb = B.meta?.sampleRate;
      if (ra && rb && ra !== rb && app.engine) {
        out.push({ level: 'info', text: t('hintRates', { rate: fmtRate(app.engine.sampleRate) }) });
      }
      const la = A.analysis?.loudness.integrated, lb = B.analysis?.loudness.integrated;
      if (la !== undefined && lb !== undefined && Number.isFinite(la) && Number.isFinite(lb) && Math.abs(la - lb) >= 0.5) {
        const louder = la > lb ? 'A' : 'B';
        out.push({
          level: app.levelMatch ? 'good' : 'warn',
          text: `${t('hintLouder', { slot: louder, lu: Math.abs(la - lb).toFixed(1) })} ${app.levelMatch ? t('hintLouderMatched') : t('hintLouderUnmatched')}`,
        });
      }
      if (app.align?.applied) {
        out.push({ level: 'good', text: t('hintAligned', { ms: fmtSigned(app.align.offset * 1000, 'ms'), corr: app.align.correlation.toFixed(2) }) });
      }
    }
    return out;
  });

  const ICON = { info: 'info', warn: 'warn', bad: 'warn', good: 'check' } as const;
</script>

<div class="compare">
  <table>
    <thead>
      <tr>
        <th class="prop"></th>
        <th class="a"><span class="tag a">A</span></th>
        <th class="b"><span class="tag b">B</span></th>
      </tr>
    </thead>
    {#each groups as group (group.name)}
      <tbody>
        <tr class="group"><th colspan="3">{t(group.name)}</th></tr>
        {#each group.rows as row (row.label)}
          {#if row.v.A !== '–' || row.v.B !== '–'}
            <tr title={row.title ? t(row.title) : undefined}>
              <th class="prop">{t(row.label)}</th>
              {#each SLOTS as s (s)}
                <td class="num" class:better={row.better === s}>
                  <span class="val">{row.v[s]}</span>
                  {#if row.better === s}<span class="dot" title={t('better')}></span>{/if}
                </td>
              {/each}
            </tr>
          {/if}
        {/each}
      </tbody>
    {/each}
  </table>

  {#if hints.length}
    <ul class="hints">
      {#each hints as h, i (i)}
        <li class={h.level}>
          <Icon name={ICON[h.level]} size={15} />
          <span>{#if h.slot}<span class="tag {h.slot.toLowerCase()}">{h.slot}</span>{/if}{h.text}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .compare {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 13px;
  }
  th,
  td {
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    padding-bottom: 10px;
  }
  .prop {
    width: 34%;
    font-weight: 500;
    color: var(--muted);
  }
  td {
    color: var(--text);
    border-top: 1px solid var(--line);
    word-break: break-word;
  }
  tbody tr:not(.group) th {
    border-top: 1px solid var(--line);
  }
  td.num {
    font-family: var(--mono);
    font-size: 12.5px;
  }
  td.better .val {
    color: var(--good);
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--good);
    vertical-align: middle;
  }
  tr.group th {
    padding-top: 18px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .tag {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-right: 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 800;
    color: var(--on-accent);
    vertical-align: -1px;
    font-family: var(--font);
  }
  .tag.a {
    background: var(--a);
  }
  .tag.b {
    background: var(--b);
  }
  .hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hints li {
    display: flex;
    gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-2);
  }
  .hints li :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .hints .tag {
    width: 18px;
    height: 18px;
    font-size: 10px;
  }
  .hints .info :global(svg) {
    color: var(--muted);
  }
  .hints .good :global(svg) {
    color: var(--good);
  }
  .hints .warn :global(svg) {
    color: var(--warn);
  }
  .hints .bad {
    background: var(--bad-soft);
  }
  .hints .bad :global(svg) {
    color: var(--bad);
  }
  @media (max-width: 720px) {
    th,
    td {
      padding: 6px 6px;
    }
    .prop {
      width: 30%;
    }
    td.num {
      font-size: 11.5px;
    }
  }
</style>
