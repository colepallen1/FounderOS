import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled sync. Vercel Cron sends "Authorization: Bearer $CRON_SECRET".
 * An external pinger (e.g. cron-job.org every 15 min) can call it the same way.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSync());
  } catch (err) {
    // Caller holds CRON_SECRET, so the real reason is safe to show and saves a trip to the logs.
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
