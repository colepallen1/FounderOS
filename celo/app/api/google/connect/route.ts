import { NextResponse } from 'next/server';
import { googleAuthUrl } from '@/lib/integrations/google';

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const url = await googleAuthUrl(origin, state);
  if (!url) return NextResponse.redirect(new URL('/settings?google=missing-client', req.url));
  const res = NextResponse.redirect(url);
  res.cookies.set('celo_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600, secure: process.env.NODE_ENV === 'production' });
  return res;
}
