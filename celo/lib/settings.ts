import 'server-only';
import { q, one } from './db';
import { appSecret } from './config';
import { decryptSecret, encryptSecret } from './token';

/**
 * Integration credentials. An environment variable always wins (set it in
 * Vercel if you prefer); otherwise the value pasted on the Integrations page,
 * stored AES-GCM encrypted with CELO_SECRET.
 */
export const SECRET_KEYS = {
  'stripe.secret_key': 'STRIPE_SECRET_KEY',
  'stripe.webhook_secret': 'STRIPE_WEBHOOK_SECRET',
  'google.client_id': 'GOOGLE_CLIENT_ID',
  'google.client_secret': 'GOOGLE_CLIENT_SECRET',
  'google.refresh_token': 'GOOGLE_REFRESH_TOKEN',
  'google_ads.developer_token': 'GOOGLE_ADS_DEVELOPER_TOKEN',
  'google_ads.login_customer_id': 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'meta.access_token': 'META_ACCESS_TOKEN',
  'anthropic.api_key': 'ANTHROPIC_API_KEY',
} as const;
export type SecretKey = keyof typeof SECRET_KEYS;

export async function getSecret(key: SecretKey): Promise<string | null> {
  const env = process.env[SECRET_KEYS[key]];
  if (env) return env;
  const row = await one<{ value: string }>('SELECT value FROM settings WHERE key = $1', [`secret:${key}`]);
  const secret = appSecret();
  if (!row || !secret) return null;
  return decryptSecret(row.value, secret);
}

export async function secretSource(key: SecretKey): Promise<'env' | 'saved' | null> {
  if (process.env[SECRET_KEYS[key]]) return 'env';
  const row = await one('SELECT 1 FROM settings WHERE key = $1', [`secret:${key}`]);
  return row ? 'saved' : null;
}

export async function setSecret(key: SecretKey, value: string | null): Promise<void> {
  if (!value) {
    await q('DELETE FROM settings WHERE key = $1', [`secret:${key}`]);
    return;
  }
  const secret = appSecret();
  if (!secret) throw new Error('CELO_SECRET is not set, so credentials cannot be stored encrypted.');
  await q(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [`secret:${key}`, await encryptSecret(value, secret)],
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await one<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await q(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

/** Show only the last 4 characters of a key. */
export function mask(value: string | null): string {
  if (!value) return '';
  return value.length <= 8 ? '••••' : `••••${value.slice(-4)}`;
}
