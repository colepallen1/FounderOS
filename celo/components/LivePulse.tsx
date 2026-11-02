'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';

const STALE_AFTER_S = 10 * 60; // pull fresh data if the last sync is older than this
const REFRESH_EVERY_MS = 60_000; // re-render from the database (webhooks land here)

/**
 * Keeps an open dashboard live: re-renders every minute, and triggers a full
 * sync whenever the data is more than 10 minutes old. Plus a manual Sync button.
 */
export function LivePulse({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const out = (await res.json()) as Record<string, string>;
      setError(!res.ok || Object.values(out).some((v) => v.startsWith('error')));
      setAge(0);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/sync', { cache: 'no-store' });
        const { staleSeconds } = (await res.json()) as { staleSeconds: number | null };
        if (!alive) return;
        setAge(staleSeconds);
        if (staleSeconds == null || staleSeconds > STALE_AFTER_S) await sync();
        else router.refresh();
      } catch {
        /* offline; try next tick */
      }
    };
    tick();
    const id = setInterval(() => document.visibilityState === 'visible' && tick(), REFRESH_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [configured, router, sync]);

  if (!configured) {
    return <span className="hidden text-[11px] uppercase tracking-[0.18em] text-faint sm:inline">No sources connected</span>;
  }
  const label = busy ? 'Syncing' : error ? 'Sync issue' : age == null ? 'Live' : age < 90 ? 'Live' : `Synced ${Math.round(age / 60)}m ago`;
  return (
    <div className="flex items-center gap-3">
      <span className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] ${error ? 'text-warn' : 'text-muted'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-warn' : 'bg-good'} ${busy ? '' : 'live-dot'}`} />
        {label}
      </span>
      <button onClick={sync} disabled={busy} className="btn-ghost px-2 py-1.5" aria-label="Sync now" title="Sync all sources now">
        <Icon name="sync" size={14} className={busy ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
