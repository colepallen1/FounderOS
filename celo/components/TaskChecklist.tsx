'use client';

import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
import { toggleTaskDone } from '@/lib/actions';
import type { Task } from '@/lib/types';
import { Icon } from './Icon';

export function TaskChecklist({ tasks, today, showClient = true }: { tasks: Task[]; today: string; showClient?: boolean }) {
  const [, start] = useTransition();
  const [done, setDone] = useOptimistic<Set<string>, string>(new Set(), (s, id) => new Set(s).add(id));
  return (
    <ul className="divide-y divide-line/60">
      {tasks.map((t) => {
        const isDone = done.has(t.id);
        const late = t.due_date && t.due_date < today;
        return (
          <li key={t.id} className={`flex items-start gap-3 py-2.5 transition-opacity ${isDone ? 'opacity-40' : ''}`}>
            <button
              aria-label={`Mark "${t.title}" done`}
              onClick={() =>
                start(async () => {
                  setDone(t.id);
                  await toggleTaskDone(t.id, true);
                })
              }
              className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border border-muted/50 text-accent hover:border-accent"
              style={{ borderRadius: 'var(--radius)' }}
            >
              {isDone && <Icon name="check" size={12} strokeWidth={2.5} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className={`text-[14px] leading-snug ${isDone ? 'line-through' : ''}`}>
                {t.priority === 1 && <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warn">High</span>}
                {t.title}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-faint">
                {showClient && t.client_slug && (
                  <Link href={`/clients/${t.client_slug}?tab=work`} className="hover:text-muted">
                    {t.client_name}
                  </Link>
                )}
                {showClient && !t.client_slug && <span>Internal</span>}
                {t.due_date && <span className={late ? 'text-bad' : ''}>{late ? 'Overdue · ' : ''}{new Date(`${t.due_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>}
                {t.recurring_id && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="repeat" size={11} /> recurring
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
