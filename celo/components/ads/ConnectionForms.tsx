'use client';

import { useRef, useState, useTransition } from 'react';
import { addMetaConnection, deleteMetaConnection, linkAdAccount, recheckMetaConnection } from '@/lib/meta/ui-actions';
import { Icon } from '../Icon';

export function AddConnectionForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          const r = await addMetaConnection(fd);
          if (r.ok) {
            ref.current?.reset();
            setMsg(r.data!.status === 'ok' ? `Connected. Found ${r.data!.accounts} ad account${r.data!.accounts === 1 ? '' : 's'}.` : r.data!.status === 'needs_permission' ? `Connected with missing permissions. Found ${r.data!.accounts} ad accounts; see below.` : 'Saved, but Meta rejected the token. See the message below.');
          } else setMsg(r.error);
        })
      }
      className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
    >
      <div>
        <label className="label">Name</label>
        <input name="label" placeholder="Celo Digital BM" className="field" />
      </div>
      <div>
        <label className="label">System-user access token</label>
        <input name="token" type="password" required autoComplete="off" placeholder="EAAG..." className="field font-mono text-[13px]" />
      </div>
      <button disabled={pending} className="btn justify-center">
        <Icon name="plug" size={14} /> {pending ? 'Checking' : 'Connect'}
      </button>
      {msg && <p className="text-[12.5px] text-muted sm:col-span-3">{msg}</p>}
    </form>
  );
}

export function ConnectionButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-2">
      <button disabled={pending} onClick={() => start(async () => void (await recheckMetaConnection(id)))} className="btn-ghost px-2.5 py-1">
        <Icon name="sync" size={12} className={pending ? 'animate-spin' : ''} /> Recheck
      </button>
      <button disabled={pending} onClick={() => confirm('Remove this connection and its ad accounts from Celo Command? Nothing changes in Meta.') && start(() => deleteMetaConnection(id))} className="btn-ghost px-2.5 py-1">
        <Icon name="trash" size={12} />
      </button>
    </span>
  );
}

export function LinkSelect({ accountId, clientId, clients }: { accountId: string; clientId: string | null; clients: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select disabled={pending} defaultValue={clientId ?? ''} onChange={(e) => start(() => linkAdAccount(accountId, e.target.value))} className="field w-auto min-w-[200px] py-1.5 text-[13px]" aria-label="Linked client">
      <option value="">Not linked</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
