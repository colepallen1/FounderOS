import Link from 'next/link';
import { ManualPaymentForm, PaymentsTable } from '@/components/Payments';
import { Badge, Empty, NotConfigured, PageHeader, Panel, STATUS_TONE, Stat } from '@/components/ui';
import { fmtDate } from '@/components/format';
import { formatMoney } from '@/lib/money';
import { clientOptions, listPayments, listSubscriptions, moneySummary, stripeCustomers } from '@/lib/queries';
import { configured } from '@/lib/sync';

export const metadata = { title: 'Money' };
export const dynamic = 'force-dynamic';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
];

export default async function Money({ searchParams }: { searchParams: { status?: string } }) {
  const status = FILTERS.some((f) => f.id === searchParams.status) ? searchParams.status : '';
  const [money, payments, subs, clients, conn] = await Promise.all([
    moneySummary(),
    listPayments({ status: status || undefined, limit: 250 }),
    listSubscriptions({ live: true }),
    clientOptions(),
    configured(),
  ]);
  const customers = conn.stripe ? await stripeCustomers() : [];
  const unlinkedPaying = customers.filter((c) => !c.linked_to && subs.some((s) => s.stripe_customer_id === c.id));
  const cur = money.currency;
  return (
    <>
      <PageHeader eyebrow="Revenue" title="Money" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Monthly recurring" value={formatMoney(money.mrr, cur, { compact: true })} sub={`${formatMoney(money.stripeMrr, cur)} Stripe · ${formatMoney(money.manualMrr, cur)} manual`} />
        <Stat label="Annual run rate" value={formatMoney(money.mrr * 12, cur, { compact: true })} sub="MRR x 12" />
        <Stat label="Collected this month" value={formatMoney(money.cashThisMonth, cur, { compact: true })} sub={`${formatMoney(money.cashLastMonthToDate, cur)} by this point last month`} />
        <Stat label="Past due" value={money.pastDue} tone={money.pastDue ? 'bad' : undefined} sub={`${money.failed30d} failed charge${money.failed30d === 1 ? '' : 's'} in 30 days`} />
      </div>

      <Panel title="Log an off-Stripe payment" icon="plus" className="mt-4">
        <ManualPaymentForm clients={clients} />
      </Panel>

      {unlinkedPaying.length > 0 && (
        <Panel title="Stripe customers not linked to a client" icon="alert" className="mt-4">
          <p className="mb-3 text-[13px] text-muted">These customers pay a subscription but are not on any client page, so their revenue is missing from client totals. Open a client, then Settings, to link them.</p>
          <div className="flex flex-wrap gap-2">
            {unlinkedPaying.map((c) => (
              <Badge key={c.id} tone="warn">
                {c.label}
              </Badge>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`Live subscriptions · ${subs.length}`} icon="repeat" className="mt-4" pad={!subs.length}>
        {!conn.stripe ? (
          <NotConfigured what="Stripe" href="/settings#stripe" />
        ) : subs.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="hidden sm:table-cell">Plan</th>
                  <th>Status</th>
                  <th>Renews</th>
                  <th className="text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-[200px] truncate">
                      {s.client_slug ? (
                        <Link href={`/clients/${s.client_slug}?tab=revenue`} className="hover:text-accent-hi">
                          {s.client_name}
                        </Link>
                      ) : (
                        <span className="text-muted">{s.customer_label}</span>
                      )}
                    </td>
                    <td className="hidden max-w-[240px] truncate text-muted sm:table-cell">{s.description || '-'}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <Badge tone={STATUS_TONE[s.status] ?? 'muted'}>{s.status.replace('_', ' ')}</Badge>
                        {s.cancel_at_period_end && <Badge tone="warn">Cancelling</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(s.current_period_end)}</td>
                    <td className="num text-right text-[15px]">{formatMoney(s.mrr_cents, s.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No active subscriptions in Stripe.</Empty>
        )}
      </Panel>

      <Panel
        title="Payments"
        icon="money"
        className="mt-4"
        pad={false}
        action={
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.id || 'all'}
                href={f.id ? `/money?status=${f.id}` : '/money'}
                className={`px-2 py-1 text-[10.5px] uppercase tracking-[0.14em] ${status === f.id ? 'text-accent-hi' : 'text-faint hover:text-muted'}`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        }
      >
        <div className={payments.length ? '' : 'p-5'}>
          <PaymentsTable payments={payments} />
        </div>
      </Panel>
    </>
  );
}
