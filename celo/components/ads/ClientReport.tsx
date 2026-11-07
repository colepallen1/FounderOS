import { BarChart } from '../BarChart';
import { Badge } from '../ui';
import type { ClientReportData } from '@/lib/meta/report';
import type { Metric } from '@/lib/meta/analysis';
import { cur, num, pct } from './fmt';

function delta(d: ClientReportData, metric: Metric, good: 'up' | 'down') {
  const c = d.cmp.changes[metric];
  if (!c || c.pct == null) return null;
  const arrow = c.pct > 0 ? '▲' : '▼';
  const cls = c.classification === 'signal' ? ((c.direction === 'up') === (good === 'up') ? 'text-good' : 'text-bad') : 'text-faint';
  return <span className={cls}>{arrow} {Math.abs(c.pct).toFixed(0)}% vs previous {d.range.days} days</span>;
}

/** The client-facing report. Same component in the app and behind a share link. */
export function ClientReport({ d, clientName }: { d: ClientReportData; clientName: string }) {
  const t = d.cmp.now;
  const kpis: [string, string, React.ReactNode][] = [
    ['Ad spend', cur(t.spend, d.currency), delta(d, 'spend', 'up')],
    [d.resultLabel, num(t.results, 1), delta(d, 'results', 'up')],
    ['Cost per result', cur(t.cpa, d.currency), delta(d, 'cpa', 'down')],
    ['Return on ad spend', t.roas == null ? '-' : `${t.roas.toFixed(2)}x`, delta(d, 'roas', 'up')],
    ['People reached', d.reach ? num(d.reach.reach) : num(t.impressions), d.reach ? <span className="text-faint">frequency {d.reach.frequency.toFixed(2)}</span> : <span className="text-faint">impressions</span>],
    ['Link click-through rate', pct(t.ctr), delta(d, 'ctr', 'up')],
  ];
  return (
    <div className="report space-y-4">
      <div className="panel p-6">
        <div className="eyebrow">Executive summary · {d.range.since} to {d.range.until}</div>
        <p className="display mt-3 text-[22px] leading-snug text-ink">{d.summary.text}</p>
        <div className="mt-3 text-[11.5px] text-faint">
          {d.summary.source === 'claude' ? 'Written with Claude from the figures below' : 'Computed from the figures below'} · {clientName} · {d.accounts.map((a) => a.name).join(', ')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map(([k, v, s]) => (
          <div key={k} className="panel p-5">
            <div className="eyebrow">{k}</div>
            <div className="num mt-2 text-[30px] leading-none text-ink">{v}</div>
            <div className="mt-2 text-[11.5px]">{s}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="eyebrow mb-3">Spend per day</div>
          <BarChart caption="Ad spend per day" height={180} highlightLast={false} currency={d.currency.toLowerCase()} bars={d.series.map((s) => ({ key: s.day, label: s.day.slice(8), value: Math.round(s.spend * 100), display: cur(s.spend, d.currency) }))} />
        </div>
        <div className="panel p-5">
          <div className="eyebrow mb-3">{d.resultLabel} per day</div>
          <ResultBars series={d.series} />
        </div>
      </div>
      <div className="panel">
        <div className="eyebrow border-b border-line/70 px-5 py-3.5">Campaigns</div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="text-right">Spend</th>
                <th className="text-right">{d.resultLabel}</th>
                <th className="text-right">Per result</th>
                <th className="text-right">ROAS</th>
                <th className="text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {d.campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name} {c.status !== 'ACTIVE' && <Badge tone="muted">{c.status.toLowerCase()}</Badge>}
                  </td>
                  <td className="num text-right">{cur(c.t.spend, d.currency)}</td>
                  <td className="num text-right">{num(c.t.results, 1)}</td>
                  <td className="num text-right">{cur(c.t.cpa, d.currency)}</td>
                  <td className="num text-right">{c.t.roas == null ? '-' : `${c.t.roas.toFixed(2)}x`}</td>
                  <td className="num text-right">{pct(c.t.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {d.creatives.length > 0 && (
        <div className="panel p-5">
          <div className="eyebrow mb-3">Best performing ads</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.creatives.map((c) => (
              <div key={c.id} className="flex gap-3 border border-line p-3" style={{ borderRadius: 'var(--radius)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.thumbnail ? <img src={c.thumbnail} alt="" className="h-16 w-16 object-cover" /> : <span className="h-16 w-16 bg-raised" />}
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink">{c.name}</div>
                  <div className="mt-1 text-[12px] text-muted">{num(c.t.results, 1)} results · {cur(c.t.cpa, d.currency)} each</div>
                  <div className="text-[12px] text-faint">CTR {pct(c.t.ctr)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBars({ series }: { series: { day: string; results: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.results));
  return (
    <div className="flex h-[180px] items-end gap-[2px]" role="img" aria-label="Results per day">
      {series.map((s) => (
        <div key={s.day} title={`${s.day}: ${s.results.toFixed(1)}`} className="flex-1 bg-accent" style={{ height: `${(s.results / max) * 100}%`, minHeight: s.results ? 2 : 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
      ))}
    </div>
  );
}
