'use client';

import { useState, useTransition } from 'react';
import { syncMetaAccount } from '@/lib/meta/ui-actions';
import { Icon } from '../Icon';

export function SyncAccountButton({ accountId }: { accountId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className={`max-w-[260px] truncate text-[11.5px] ${msg.startsWith('error') ? 'text-bad' : 'text-muted'}`} title={msg}>{msg}</span>}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncMetaAccount(accountId);
            setMsg(r.ok ? (r.data ?? 'Synced') : `error: ${r.error}`);
          })
        }
        className="btn-ghost px-2.5 py-1.5"
        title="Sync this ad account from Meta now"
      >
        <Icon name="sync" size={13} className={pending ? 'animate-spin' : ''} /> {pending ? 'Syncing' : 'Sync'}
      </button>
    </span>
  );
}
