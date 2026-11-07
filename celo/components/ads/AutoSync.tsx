'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { syncMetaAccount } from '@/lib/meta/ui-actions';

/** Re-sync this account from Meta when the page opens on data older than 10 minutes. */
export function AutoSync({ accountId, lastSynced }: { accountId: string; lastSynced: string | null }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const age = lastSynced ? Date.now() - new Date(lastSynced).getTime() : Infinity;
    if (age > 10 * 60_000) syncMetaAccount(accountId).then(() => router.refresh());
  }, [accountId, lastSynced, router]);
  return null;
}
