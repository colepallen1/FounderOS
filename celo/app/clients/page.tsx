import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Badge, Empty, PageHeader, STATUS_TONE } from '@/components/ui';
import { fmtDate } from '@/components/format';
import { formatMoney } from '@/lib/money';
import { listClients } from '@/lib/queries';

export const metadata = { title: 'Clients' };
export const dynamic = 'force-dynamic';

export default async function Clients({ searchParams }: { searchParams: { show?: string } }) {
  const all = await listClients();
  const showAll = searchParams.show === 'all';
  const clients = showAll ? all : all.filter((c) => c.status !== 'churned');
  const mrr = all.reduce((s, c) => s + (c.status === 'churned' ? 0 : c.mrr_cents), 0);
  const churned = all.length - all.filter((c) => c.status !== 'churned').length;
  return (
    <>
      <PageHeader eyebrow={`${all.filter((c) => c.status === 'active').length} active · ${formatMoney(mrr)} MRR`} title="Clients">
        {churned > 0 && (
          <Link href={showAll ? '/clients' : '/clients?show=all'} className="btn-ghost">
            {showAll ? 'Hide churned' : `Show churned (${churned})`}
          </Link>
        )}
        <Link href="/clients/new" className="btn">
          <Icon name="plus" size={14} /> New client
        </Link>
      </PageHeader>
      {clients.length === 0 ? (
        <div className="panel p-10">
          <Empty>
            No clients yet.{' '}
            <Link href="/clients/new" className="link">
              Add your first client
            </Link>{' '}
            and every page fills in around them.
          </Empty>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.slug}`} className="panel group block p-5 transition-colors hover:border-accent/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="display truncate text-[24px] leading-tight text-ink group-hover:text-accent-hi">{c.name}</div>
                  <div className="mt-1 truncate text-[12px] text-faint">{c.services.length ? c.services.join(' · ') : 'No services set'}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  {c.past_due && <Badge tone="bad" icon="alert">Past due</Badge>}
                </div>
              </div>
              <div className="rule my-4 opacity-60" />
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="eyebrow">MRR</dt>
                  <dd className="num mt-1 text-[22px]">{c.mrr_cents ? formatMoney(c.mrr_cents, 'usd', { compact: true }) : <span className="text-faint">-</span>}</dd>
                  {c.mrr_source === 'manual' && <dd className="text-[10.5px] text-faint">manual</dd>}
                </div>
                <div>
                  <dt className="eyebrow">Lifetime</dt>
                  <dd className="num mt-1 text-[22px]">{c.ltv_cents ? formatMoney(c.ltv_cents, 'usd', { compact: true }) : <span className="text-faint">-</span>}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Open tasks</dt>
                  <dd className="num mt-1 text-[22px]">
                    {c.open_tasks}
                    {c.overdue_tasks > 0 && <span className="ml-1 text-[12px] text-bad">{c.overdue_tasks} late</span>}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-faint">
                {c.last_paid_at && <span>Last paid {fmtDate(c.last_paid_at)}</span>}
                {c.ad_spend_30d_cents > 0 && <span>Ad spend 30d {formatMoney(c.ad_spend_30d_cents)}</span>}
                {c.renewal_date && <span>Renews {fmtDate(c.renewal_date)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
