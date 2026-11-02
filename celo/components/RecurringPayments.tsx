'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { deleteRecurringPayment, setRecurringPaymentActive } from '@/lib/actions';
import { billingLabel } from '@/lib/money';
import type { RecurringPayment } from '@/lib/queries';
import { Icon } from './Icon';

export function RecurringPayments({ items, showClient = true }: { items: RecurringPayment[]; showClient?: boolean }) {
  const [, start] = useTransition();
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-line/60">
      {items.map((r) => (
        <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${r.active ? '' : 'opacity-50'}`}>
          <Icon name="repeat" size={14} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px]">
              {showClient && (r.client_slug ? <Link href={`/clients/${r.client_slug}?tab=revenue`} className="hover:text-accent-hi">{r.client_name}</Link> : <span>{r.description || 'No client'}</span>)}
              {showClient && ' · '}
              <span className="num">{billingLabel([{ amount_cents: r.amount_cents, interval: r.interval, interval_count: r.interval_count }], r.currency)}</span>
            </div>
            <div className="text-[11.5px] text-faint">
              {r.method || 'Manual'}
              {r.active ? ` · next logs ${new Date(`${r.next_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : ' · paused'}
              {r.description && showClient && r.client_slug ? ` · ${r.description}` : ''}
            </div>
          </div>
          <button onClick={() => start(() => setRecurringPaymentActive(r.id, !r.active))} className="btn-ghost px-2 py-1 text-[10.5px]">
            {r.active ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => confirm('Delete this schedule? Payments already logged stay.') && start(() => deleteRecurringPayment(r.id))} className="text-faint hover:text-bad" aria-label="Delete schedule">
            <Icon name="trash" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
