import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, appSecret, authDisabled } from '@/lib/config';
import { verifySessionToken } from '@/lib/token';

// Routes that authenticate themselves (signature / bearer secret) or are the login itself.
const PUBLIC = ['/login', '/api/auth/login', '/api/webhooks/stripe', '/api/cron/sync'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (authDisabled()) return NextResponse.next();

  const secret = appSecret();
  const ok = secret ? await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret) : false;
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
