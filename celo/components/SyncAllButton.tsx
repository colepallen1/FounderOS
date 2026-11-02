'use client';

import { useState, useTransition } from 'react';
import { syncNow } from '@/lib/actions';
import { Icon } from './Icon';

export function SyncAllButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-[12px] text-muted">{result}</span>}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncNow();
            const errors = Object.entries(r).filter(([, v]) => v.startsWith('error'));
            setResult(errors.length ? `${errors.length} source${errors.length > 1 ? 's' : ''} failed, see below` : 'All sources synced');
          })
        }
        className="btn"
      >
        <Icon name="sync" size={14} className={pending ? 'animate-spin' : ''} /> {pending ? 'Syncing' : 'Sync all now'}
      </button>
    </div>
  );
}
