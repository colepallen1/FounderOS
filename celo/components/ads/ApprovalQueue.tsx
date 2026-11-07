'use client';

import { useState, useTransition } from 'react';
import { approveChange, rejectChange } from '@/lib/meta/ui-actions';
import type { MetaAction } from '@/lib/meta/actions';
import { Badge } from '../ui';
import { Icon } from '../Icon';

const SOURCE = { you: 'You', rule: 'Rule', claude: 'Claude' } as const;

export function ApprovalQueue({ actions, showClient = true }: { actions: MetaAction[]; showClient?: boolean }) {
  if (!actions.length) return <div className="py-4 text-center text-sm text-faint">Nothing waiting for approval.</div>;
  return (
    <ul className="divide-y divide-line/60">
      {actions.map((a) => (
        <ActionRow key={a.id} a={a} showClient={showClient} />
      ))}
    </ul>
  );
}

function ActionRow({ a, showClient }: { a: MetaAction; showClient: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const approve = () => {
    const warn = a.risk === 'spend' ? 'This will spend money in Meta. ' : '';
    if (!confirm(`${warn}Approve and run now?\n\n${a.summary}`)) return;
    setError(null);
    start(async () => {
      const r = await approveChange(a.id);
      if (!r.ok) setError(r.error);
    });
  };
  return (
    <li className={`py-3 ${pending ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-ink">{a.summary}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={a.risk === 'spend' ? 'warn' : 'muted'} icon={a.risk === 'spend' ? 'money' : undefined}>
              {a.risk === 'spend' ? 'Spends money' : 'Material change'}
            </Badge>
            <Badge tone={a.source === 'claude' ? 'accent' : 'muted'}>From {SOURCE[a.source]}</Badge>
            {showClient && a.client_name && <span className="text-[11.5px] text-faint">{a.client_name}</span>}
          </div>
          {a.rationale && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{a.rationale}</p>}
          {error && <p className="mt-1.5 text-[12.5px] text-bad">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={approve} disabled={pending} className="btn px-2.5 py-1.5">
            <Icon name="check" size={13} /> Approve
          </button>
          <button onClick={() => start(() => rejectChange(a.id))} disabled={pending} className="btn-ghost px-2.5 py-1.5">
            Reject
          </button>
        </div>
      </div>
    </li>
  );
}
