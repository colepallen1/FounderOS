import Link from 'next/link';
import { addManualPayment } from '@/lib/actions';
import { formatMoney } from '@/lib/money';
import type { Payment } from '@/lib/types';
import { fmtDate } from './format';
import { Icon } from './Icon';
import { DeletePaymentButton } from './DeletePaymentButton';
import { Badge, Empty, STATUS_TONE } from './ui';

export function PaymentsTable({ payments, showClient = true }: { payments: Payment[]; showClient?: boolean }) {
  if (!payments.length) return <Empty>No payments yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            {showClient && <th>Client</th>}
            <th className="hidden sm:table-cell">Description</th>
            <th>Status</th>
            <th className="text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap text-muted">{fmtDate(p.paid_at, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
              {showClient && (
                <td className="max-w-[180px] truncate">
                  {p.client_slug ? (
                    <Link href={`/clients/${p.client_slug}?tab=revenue`} className="hover:text-accent-hi">
                      {p.client_name}
                    </Link>
                  ) : (
                    <span className="text-faint">{p.customer_label ?? 'Unlinked'}</span>
                  )}
                </td>
              )}
              <td className="hidden max-w-[280px] truncate text-muted sm:table-cell" title={p.failure_message || p.description}>
                {p.status === 'failed' && p.failure_message ? <span className="text-bad">{p.failure_message}</span> : p.description || <span className="text-faint">{p.source === 'manual' ? p.method || 'Manual' : p.method}</span>}
              </td>
              <td>
                <div className="flex gap-1.5">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  {p.source === 'manual' && <Badge tone="muted">Manual</Badge>}
                </div>
              </td>
              <td className={`num whitespace-nowrap text-right text-[15px] ${p.status === 'failed' ? 'text-faint line-through' : ''}`}>
                {formatMoney(p.amount_cents - (p.status === 'refunded' ? p.refunded_cents : 0), p.currency, { cents: true })}
                {p.refunded_cents > 0 && p.status !== 'refunded' && <div className="text-[11px] text-warn">-{formatMoney(p.refunded_cents, p.currency, { cents: true })} refunded</div>}
              </td>
              <td>{p.source === 'manual' && <DeletePaymentButton id={p.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManualPaymentForm({ clients, fixedClient }: { clients: { id: string; name: string }[]; fixedClient?: { id: string; slug: string } }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={addManualPayment} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
      {fixedClient && <input type="hidden" name="client_id" value={fixedClient.id} />}
      {fixedClient && <input type="hidden" name="client_slug" value={fixedClient.slug} />}
      <div>
        <label className="label">Amount (USD)</label>
        <input name="amount" required inputMode="decimal" placeholder="2500" className="field" />
      </div>
      <div>
        <label className="label">Received</label>
        <input name="paid_at" type="date" required defaultValue={today} className="field" />
      </div>
      <div>
        <label className="label">Method</label>
        <select name="method" className="field" defaultValue="Wire">
          {['Wire', 'ACH', 'PayPal', 'Zelle', 'Cash', 'Check', 'Crypto', 'Other'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      {fixedClient ? (
        <div>
          <label className="label">Note</label>
          <input name="description" placeholder="November retainer" className="field" />
        </div>
      ) : (
        <div>
          <label className="label">Client</label>
          <select name="client_id" className="field" defaultValue="">
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!fixedClient && (
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label">Note</label>
          <input name="description" placeholder="November retainer" className="field" />
        </div>
      )}
      <button className="btn justify-center lg:row-start-1 lg:col-start-5">
        <Icon name="plus" size={14} /> Log payment
      </button>
    </form>
  );
}
