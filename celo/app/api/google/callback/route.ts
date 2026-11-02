import { NextResponse, type NextRequest } from 'next/server';
import { exchangeGoogleCode } from '@/lib/integrations/google';
import { runSync } from '@/lib/sync';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const back = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/settings?google=${encodeURIComponent(msg)}`, req.url));
    res.cookies.delete('celo_oauth_state');
    return res;
  };
  if (!code || !state || state !== req.cookies.get('celo_oauth_state')?.value) return back(url.searchParams.get('error') || 'state-mismatch');
  try {
    await exchangeGoogleCode(code, url.origin);
  } catch (err) {
    return back(err instanceof Error ? err.message : 'failed');
  }
  await runSync(['calendar', 'gmail', 'google_ads']);
  return back('connected');
}
