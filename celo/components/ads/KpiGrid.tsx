import type { Comparison, Metric } from '@/lib/meta/analysis';
import { cur, num, pct } from './fmt';

type Tile = { label: string; value: string; metric?: Metric; good?: 'up' | 'down'; note?: string };

/** A change is only coloured when it is signal (beyond the noise band, on enough volume). */
function Change({ cmp, metric, good }: { cmp: Comparison; metric: Metric; good?: 'up' | 'down' }) {
  const ch = cmp.changes[metric];
  if (!ch || ch.pct == null) return <span className="text-faint">no comparison</span>;
  const arrow = ch.pct > 0 ? '▲' : ch.pct < 0 ? '▼' : '';
  const label = `${arrow} ${Math.abs(ch.pct).toFixed(0)}%`;
  if (ch.classification === 'signal' && good) {
    const better = (ch.direction === 'up') === (good === 'up');
    return <span className={better ? 'text-good' : 'text-bad'}>{label}</span>;
  }
  const tag = ch.classification === 'noise' ? 'within noise' : ch.classification === 'insufficient' ? 'too little data' : ch.classification === 'observed' ? 'vs previous' : '';
  return (
    <span className="text-muted">
      {label} {tag && <span className="text-faint">· {tag}</span>}
    </span>
  );
}

export function KpiGrid({ cmp, currency, resultLabel, reach }: { cmp: Comparison; currency: string; resultLabel: string; reach: { reach: number; frequency: number } | null }) {
  const t = cmp.now;
  const tiles: Tile[] = [
    { label: 'Spend', value: cur(t.spend, currency), metric: 'spend' },
    { label: resultLabel, value: num(t.results, 1), metric: 'results', good: 'up' },
    { label: 'Cost per result', value: cur(t.cpa, currency), metric: 'cpa', good: 'down' },
    { label: 'ROAS', value: t.roas == null ? '-' : `${t.roas.toFixed(2)}x`, metric: 'roas', good: 'up' },
    { label: 'Impressions', value: num(t.impressions), metric: 'impressions' },
    { label: 'Reach', value: reach ? num(reach.reach) : '-', note: reach ? 'live from Meta' : 'unavailable' },
    { label: 'Frequency', value: reach ? reach.frequency.toFixed(2) : '-', note: reach ? 'live from Meta' : 'unavailable' },
    { label: 'CPM', value: cur(t.cpm, currency), metric: 'cpm', good: 'down' },
    { label: 'Cost per link click', value: cur(t.cpc, currency), metric: 'cpc', good: 'down' },
    { label: 'Link CTR', value: pct(t.ctr), metric: 'ctr', good: 'up' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((x) => (
        <div key={x.label} className="panel p-4">
          <div className="eyebrow">{x.label}</div>
          <div className="num mt-2 text-[24px] leading-none text-ink sm:text-[28px]">{x.value}</div>
          <div className="mt-2 text-[11.5px]">{x.metric ? <Change cmp={cmp} metric={x.metric} good={x.good} /> : <span className="text-faint">{x.note}</span>}</div>
        </div>
      ))}
    </div>
  );
}
