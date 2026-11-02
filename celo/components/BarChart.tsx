'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/money';

export type Bar = { key: string; label: string; value: number; display: string };

/**
 * Single-series column chart. Accent fill (no legend: the panel title names
 * the series), 4px rounded data-ends on the baseline, 2px gaps, recessive grid,
 * hover tooltip with hit targets taller than the bars, and an offscreen table.
 */
export function BarChart({ bars, height = 220, currency = 'usd', highlightLast = true, caption }: { bars: Bar[]; height?: number; currency?: string; highlightLast?: boolean; caption: string }) {
  const formatTick = (v: number) => formatMoney(v, currency, { compact: true });
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 1000;
  const H = height;
  const padL = 64;
  const padB = 28;
  const padT = 12;
  const plotW = W - padL - 8;
  const plotH = H - padB - padT;
  const slot = plotW / bars.length;
  const barW = Math.min(46, slot - 2 * Math.max(2, slot * 0.18));
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={caption} preserveAspectRatio="none" style={{ height }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {bars.map((b, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(b.value > 0 ? 2 : 0, (b.value / top) * plotH);
          const r = Math.min(4, h / 2, barW / 2);
          const yTop = padT + plotH - h;
          const isLast = highlightLast && i === bars.length - 1;
          const on = hover === i;
          return (
            <g key={b.key}>
              {h > 0 && (
                <path
                  d={`M${x},${padT + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${padT + plotH} Z`}
                  fill={isLast || on ? 'rgb(var(--accent-hi))' : 'rgb(var(--accent))'}
                  opacity={hover == null || on ? 1 : 0.45}
                />
              )}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH + padB} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {/* Axis text lives in HTML so it never stretches with the SVG. */}
      <div className="pointer-events-none absolute inset-0">
        {ticks.map((t) => (
          <div key={t} className="num absolute left-0 w-[56px] -translate-y-1/2 text-right text-[10.5px] text-faint" style={{ top: `${(y(t) / H) * 100}%` }}>
            {formatTick(t)}
          </div>
        ))}
        {bars.map((b, i) => (
          <div key={b.key} className={`absolute bottom-0 -translate-x-1/2 text-[10.5px] uppercase tracking-[0.1em] ${hover === i ? 'text-ink' : 'text-faint'} ${labelClass(i, bars.length)}`} style={{ left: `${((padL + (i + 0.5) * slot) / W) * 100}%` }}>
            {b.label}
          </div>
        ))}
        {hover != null && (
          <div
            className="panel absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap px-3 py-2 text-[12px]"
            style={{ left: `${((padL + (hover + 0.5) * slot) / W) * 100}%`, top: `${(y(bars[hover].value) / H) * 100}%`, marginTop: -8 }}
          >
            <div className="eyebrow">{bars[hover].key}</div>
            <div className="num mt-0.5 text-[17px] text-ink">{bars[hover].display}</div>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th>{b.key}</th>
              <td>{b.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/** Thin out axis labels so they never collide: every other month on phones, every 5th day on phones / 3rd on desktop. */
function labelClass(i: number, n: number): string {
  const fromEnd = n - 1 - i;
  if (n > 16) return fromEnd % 5 === 0 ? '' : fromEnd % 3 === 0 ? 'hidden md:block' : 'hidden';
  if (n > 6) return fromEnd % 2 === 0 ? '' : 'hidden sm:block';
  return '';
}
