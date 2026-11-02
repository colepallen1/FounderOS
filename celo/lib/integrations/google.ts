import 'server-only';
import { q } from '../db';
import { getSecret, setSecret, setSetting } from '../settings';
import { emailDomain } from '../slug';
import { toDay } from '../recurring';

/** One Google sign-in covers Calendar, Gmail (read-only) and Google Ads. */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/adwords',
];

export const GOOGLE_ADS_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v26';

export function googleRedirectUri(origin: string): string {
  return `${process.env.CELO_PUBLIC_URL?.replace(/\/$/, '') || origin}/api/google/callback`;
}

export async function googleAuthUrl(origin: string, state: string): Promise<string | null> {
  const clientId = await getSecret('google.client_id');
  if (!clientId) return null;
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeGoogleCode(code: string, origin: string): Promise<void> {
  const [id, secret] = await Promise.all([getSecret('google.client_id'), getSecret('google.client_secret')]);
  if (!id || !secret) throw new Error('Google client ID/secret missing');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: googleRedirectUri(origin), grant_type: 'authorization_code' }),
  });
  const json = (await res.json()) as { refresh_token?: string; id_token?: string; error_description?: string; error?: string };
  if (!res.ok) throw new Error(json.error_description || json.error || `token exchange failed (${res.status})`);
  if (!json.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
  await setSecret('google.refresh_token', json.refresh_token);
  if (json.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64url').toString()) as { email?: string };
      if (payload.email) await setSetting('google.email', payload.email);
    } catch {
      /* email is cosmetic */
    }
  }
}

let cached: { token: string; exp: number } | null = null;

export async function googleAccessToken(): Promise<string | null> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const [id, secret, refresh] = await Promise.all([getSecret('google.client_id'), getSecret('google.client_secret'), getSecret('google.refresh_token')]);
  if (!id || !secret || !refresh) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token refresh failed: ${json.error_description || json.error || res.status}`);
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function gget<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

type ClientMatch = { id: string; domains: string[]; email: string };
async function clientMatchers(): Promise<ClientMatch[]> {
  const rows = await q<{ id: string; email_domains: string[]; contact_email: string }>(`SELECT id, email_domains, contact_email FROM clients WHERE status <> 'churned'`);
  return rows.map((r) => ({ id: r.id, domains: r.email_domains ?? [], email: r.contact_email.toLowerCase() }));
}
function matchClient(emails: string[], clients: ClientMatch[]): string | null {
  for (const e of emails) {
    const lower = e.toLowerCase();
    const dom = emailDomain(lower);
    const hit = clients.find((c) => (c.email && c.email === lower) || (dom && c.domains.includes(dom)));
    if (hit) return hit.id;
  }
  return null;
}

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean }[];
  hangoutLink?: string;
  htmlLink?: string;
};

/** Primary calendar, yesterday through two weeks out. Events are tied to clients by attendee email/domain. */
export async function syncCalendar(): Promise<string> {
  const token = await googleAccessToken();
  if (!token) throw new Error('not configured');
  const now = new Date();
  const min = new Date(now.getTime() - 86400000).toISOString();
  const max = new Date(now.getTime() + 14 * 86400000).toISOString();
  const data = await gget<{ items: GEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`,
    token,
  );
  const clients = await clientMatchers();
  await q(`DELETE FROM calendar_events`);
  let n = 0;
  for (const ev of data.items ?? []) {
    if (ev.status === 'cancelled') continue;
    const allDay = !ev.start?.dateTime;
    const start = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
    if (!start) continue;
    const attendees = (ev.attendees ?? []).filter((a) => !a.self && a.email).map((a) => a.email!);
    await q(
      `INSERT INTO calendar_events (id, title, starts_at, ends_at, all_day, attendees, link, client_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [ev.id, ev.summary ?? '(no title)', start, ev.end?.dateTime ?? null, allDay, JSON.stringify(attendees), ev.hangoutLink ?? ev.htmlLink ?? '', matchClient(attendees, clients)],
    );
    n++;
  }
  return `${n} events`;
}

type GMsg = { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };

/** Latest 10 messages (30 days) to or from each client's domains / contact email. */
export async function syncGmail(): Promise<string> {
  const token = await googleAccessToken();
  if (!token) throw new Error('not configured');
  const clients = await clientMatchers();
  let n = 0;
  for (const c of clients) {
    const terms = [...c.domains.map((d) => `@${d}`), ...(c.email ? [c.email] : [])];
    if (!terms.length) continue;
    const query = `{${terms.map((t) => `from:${t} to:${t}`).join(' ')}} newer_than:30d`;
    const list = await gget<{ messages?: { id: string }[] }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
      token,
    );
    await q(`DELETE FROM emails WHERE client_id = $1`, [c.id]);
    for (const m of list.messages ?? []) {
      const msg = await gget<GMsg>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        token,
      );
      const h = (name: string) => msg.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
      await q(
        `INSERT INTO emails (id, client_id, thread_id, subject, sender, snippet, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [msg.id, c.id, msg.threadId, h('subject'), h('from'), decodeEntities(msg.snippet ?? ''), new Date(Number(msg.internalDate ?? Date.now())).toISOString()],
      );
      n++;
    }
  }
  return `${n} emails across ${clients.filter((c) => c.domains.length || c.email).length} clients`;
}

function decodeEntities(s: string): string {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Google Ads daily metrics, last 30 days, for every client with a customer ID. */
export async function syncGoogleAds(): Promise<string> {
  const [token, devToken, loginCid] = await Promise.all([googleAccessToken(), getSecret('google_ads.developer_token'), getSecret('google_ads.login_customer_id')]);
  if (!token || !devToken) throw new Error('not configured');
  const clients = await q<{ id: string; google_ads_customer_id: string }>(`SELECT id, google_ads_customer_id FROM clients WHERE google_ads_customer_id <> ''`);
  const query = `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
                 FROM customer WHERE segments.date DURING LAST_30_DAYS`;
  for (const c of clients) {
    const cid = c.google_ads_customer_id.replace(/-/g, '');
    const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'developer-token': devToken,
        'content-type': 'application/json',
        ...(loginCid ? { 'login-customer-id': loginCid.replace(/-/g, '') } : {}),
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Google Ads ${cid}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const batches = (await res.json()) as { results?: { segments: { date: string }; metrics: Record<string, string | number> }[] }[];
    for (const b of batches) {
      for (const r of b.results ?? []) {
        const m = r.metrics;
        await upsertAdDay(c.id, 'google', r.segments.date, {
          spend: Math.round(Number(m.costMicros ?? 0) / 10000),
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          conversions: Number(m.conversions ?? 0),
          value: Math.round(Number(m.conversionsValue ?? 0) * 100),
        });
      }
    }
  }
  return `${clients.length} accounts`;
}

export async function upsertAdDay(
  clientId: string,
  platform: 'meta' | 'google',
  day: string,
  m: { spend: number; impressions: number; clicks: number; conversions: number; value: number },
) {
  await q(
    `INSERT INTO ad_metrics (client_id, platform, day, spend_cents, impressions, clicks, conversions, conversion_value_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (client_id, platform, day) DO UPDATE SET spend_cents = EXCLUDED.spend_cents, impressions = EXCLUDED.impressions,
       clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions, conversion_value_cents = EXCLUDED.conversion_value_cents`,
    [clientId, platform, day, m.spend, m.impressions, m.clicks, m.conversions, m.value],
  );
}

export { toDay };
