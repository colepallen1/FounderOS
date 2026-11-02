/** Environment-derived config. Safe for edge (no node imports). */
export const SESSION_COOKIE = 'celo_session';
export const THEME_COOKIE = 'celo_theme';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DEV_SECRET = 'celo-dev-only-secret-do-not-use-in-production';

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Secret used for session signing and the integrations vault. */
export function appSecret(): string | null {
  const s = process.env.CELO_SECRET;
  if (s && s.length >= 16) return s;
  return isProd() ? null : DEV_SECRET;
}

export function appPassword(): string | null {
  return process.env.CELO_PASSWORD || null;
}

/** Local dev with no password set: the app opens without a login (and says so). */
export function authDisabled(): boolean {
  return !isProd() && !appPassword();
}

/** Business timezone for "today" and month boundaries. */
export const TZ = process.env.CELO_TIMEZONE || 'America/New_York';
