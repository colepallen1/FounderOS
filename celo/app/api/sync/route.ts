import { NextResponse } from 'next/server';
import { runSync, staleSeconds } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How stale the data is, so an open page knows whether to ask for a refresh. */
export async function GET() {
  return NextResponse.json({ staleSeconds: await staleSeconds() });
}

/** Signed-in refresh (the page's live pulse and the Sync button). */
export async function POST() {
  return NextResponse.json(await runSync());
}
