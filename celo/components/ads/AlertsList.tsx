'use client';

import { useTransition } from 'react';
import { dismissAlert } from '@/lib/meta/ui-actions';
import { Badge } from '../ui';
import { Icon } from '../Icon';

export type AlertRow = { id: string; kind: string; severity: 'info' | 'warn' | 'bad'; object_name: string; message: string; day: string; client_name: string | null };
const LABEL: Record<string, string> = { zero_results: 'No results', high_cpa: 'Cost per result high', low_roas: 'ROAS low', underspend: 'Underspending', fatigue: 'Creative fatigue', shift: 'Performance shift' };

export function AlertsList({ alerts, showClient = true }: { alerts: AlertRow[]; showClient?: boolean }) {
  const [, start] = useTransition();
  if (!alerts.length) return <div className="py-4 text-center text-sm text-faint">No open alerts.</div>;
  return (
    <ul className="divide-y divide-line/60">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5">
          <Badge tone={a.severity === 'bad' ? 'bad' : a.severity === 'warn' ? 'warn' : 'accent'} icon={a.severity === 'info' ? undefined : 'alert'}>
            {LABEL[a.kind] ?? a.kind}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px]">
              <span className="text-ink">{a.object_name}</span>
              {showClient && a.client_name && <span className="text-faint"> · {a.client_name}</span>}
            </div>
            <div className="text-[12.5px] leading-relaxed text-muted">{a.message}</div>
          </div>
          <button onClick={() => start(() => dismissAlert(a.id))} className="text-faint hover:text-ink" aria-label="Dismiss alert" title="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
