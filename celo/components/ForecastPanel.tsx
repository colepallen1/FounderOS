import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import type { Forecast } from '@/lib/queries';
import { BarChart } from './BarChart';
import { fmtDate } from './format';
import { Badge, Empty, Panel } from './ui';

const KIND = { first: { label: 'First charge', tone: 'accent' }, renewal: { label: 'Renewal', tone: 'muted' }, manual: { label: 'Manual', tone: 'muted' } } as const;

export function ForecastPanel({ f, currency = 'usd' }: { f: Forecast; currency?: string }) {
  const soon = f.charges.filter((c) => c.date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  return (
    <Panel title="Forecast" icon="target" action={<span className="text-[11px] text-faint">Scheduled billing, before tax and discounts</span>}>
      <dl className="grid grid-cols-3 gap-4">
        {[
          ['Next 30 days', f.next30],
          ['Next 60 days', f.next60],
          ['Next 90 days', f.next90],
        ].map(([k, v]) => (
          <div key={k as string}>
            <dt className="eyebrow">{k}</dt>
            <dd className="num mt-1.5 text-[26px] sm:text-[32px]">{formatMoney(v as number, currency)}</dd>
          </div>
        ))}
      </dl>
      {f.starting.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-[12.5px] text-muted">
          {f.starting.map((s) => (
            <span key={s.label + s.starts} className="border border-accent/40 bg-accent/[0.06] px-2.5 py-1" style={{ borderRadius: 'var(--radius)' }}>
              {s.client_slug ? <Link href={`/clients/${s.client_slug}`} className="text-ink hover:text-accent-hi">{s.label}</Link> : <span className="text-ink">{s.label}</span>}{' '}
              starts {fmtDate(s.starts)} · +{formatMoney(s.monthly_cents, currency)}/mo
            </span>
          ))}
        </div>
      )}
      <div className="mt-6">
        <div className="eyebrow mb-3">Next 6 months</div>
        {f.months.some((m) => m.cents > 0) ? (
          <BarChart
            caption="Forecast revenue per month, next 6 months"
            height={180}
            highlightLast={false}
            currency={currency}
            bars={f.months.map((m, i) => ({ key: i === 0 ? `${m.key} (rest of month)` : m.key, label: m.label, value: m.cents, display: formatMoney(m.cents, currency) }))}
          />
        ) : (
          <Empty>No scheduled billing yet.</Empty>
        )}
      </div>
      <div className="mt-6">
        <div className="eyebrow mb-1">Upcoming charges · 30 days</div>
        {soon.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="tbl">
              <tbody>
                {soon.map((c, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="max-w-[200px] truncate">{c.client_slug ? <Link href={`/clients/${c.client_slug}`} className="hover:text-accent-hi">{c.label}</Link> : c.label}</td>
                    <td><Badge tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Badge></td>
                    <td className="num text-right text-[15px]">{formatMoney(c.cents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing scheduled in the next 30 days.</Empty>
        )}
      </div>
    </Panel>
  );
}
