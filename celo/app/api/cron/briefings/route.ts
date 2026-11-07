import { NextResponse } from 'next/server';
import { listAccounts } from '@/lib/meta/connections';
import { analyze, anthropicClient } from '@/lib/ai/ads-analyst';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily Claude briefing per linked ad account (weekly summary on Mondays). Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await anthropicClient())) return NextResponse.json({ skipped: 'Claude not configured' });
  const kind = new Date().getUTCDay() === 1 ? 'weekly' : 'daily';
  const out: Record<string, string> = {};
  for (const a of (await listAccounts()).filter((x) => x.client_id && x.last_synced_at)) {
    try {
      const r = await analyze(a, kind);
      out[a.id] = `ok, ${r.proposals} proposals`;
    } catch (err) {
      out[a.id] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return NextResponse.json({ kind, accounts: out });
}
