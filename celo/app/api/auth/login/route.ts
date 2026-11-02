import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, appPassword, appSecret } from '@/lib/config';
import { makeSessionToken, passwordMatches } from '@/lib/token';

// Small in-memory brake on guessing. Per server instance, which is enough with a strong password.
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const form = await req.formData();
  const next = String(form.get('next') ?? '/');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const back = (err: string) => NextResponse.redirect(new URL(`/login?error=${err}&next=${encodeURIComponent(safeNext)}`, req.url), 303);

  const password = appPassword();
  const secret = appSecret();
  if (!password || !secret) return back('config');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return back('locked');

  if (!(await passwordMatches(String(form.get('password') ?? ''), password, secret))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return back('wrong');
  }
  attempts.delete(ip);
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await makeSessionToken(secret, SESSION_TTL_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
