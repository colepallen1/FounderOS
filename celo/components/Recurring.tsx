'use client';

import { useState, useTransition } from 'react';
import { createRecurring, deleteRecurring, setRecurringActive } from '@/lib/actions';
import { describeRule } from '@/lib/recurring';
import type { Recurring } from '@/lib/types';
import { Icon } from './Icon';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function RecurringManager({ rules, clients, fixedClient }: { rules: Recurring[]; clients: { id: string; name: string }[]; fixedClient?: { id: string; slug: string } }) {
  const [cadence, setCadence] = useState<'weekly' | 'monthly'>('monthly');
  const [, start] = useTransition();
  return (
    <div className="space-y-5">
      {rules.length > 0 && (
        <ul className="divide-y divide-line/60">
          {rules.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 py-2.5 ${r.active ? '' : 'opacity-50'}`}>
              <Icon name="repeat" size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{r.title}</div>
                <div className="text-[11.5px] text-faint">
                  {describeRule(r.cadence, r.anchor)}
                  {!fixedClient && <> · {r.client_name ?? 'Internal'}</>}
                  {!r.active && ' · paused'}
                </div>
              </div>
              <button onClick={() => start(() => setRecurringActive(r.id, !r.active))} className="btn-ghost px-2 py-1 text-[10.5px]">
                {r.active ? 'Pause' : 'Resume'}
              </button>
              <button onClick={() => confirm(`Delete "${r.title}"? Tasks already created stay.`) && start(() => deleteRecurring(r.id))} className="text-faint hover:text-bad" aria-label="Delete rule">
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={createRecurring} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
        {fixedClient && <input type="hidden" name="client_id" value={fixedClient.id} />}
        {fixedClient && <input type="hidden" name="client_slug" value={fixedClient.slug} />}
        <div>
          <label className="label">New recurring task</label>
          <input name="title" required placeholder="Monthly performance report" className="field" />
        </div>
        <div>
          <label className="label">Repeats</label>
          <select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value as 'weekly' | 'monthly')} className="field">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="label">{cadence === 'weekly' ? 'On' : 'Day'}</label>
          {cadence === 'weekly' ? (
            <select name="weekday" defaultValue="1" className="field">
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <select name="monthday" defaultValue="1" className="field">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        {!fixedClient && (
          <div>
            <label className="label">Client</label>
            <select name="client_id" defaultValue="" className="field">
              <option value="">Internal</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn justify-center">
          <Icon name="plus" size={14} /> Add
        </button>
      </form>
      <p className="text-[11.5px] text-faint">Each occurrence lands in This week as a task up to 6 days before it is due.</p>
    </div>
  );
}
