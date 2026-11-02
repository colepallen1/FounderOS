import 'server-only';
import { q } from '../db';
import { getSecret } from '../settings';
import { upsertAdDay } from './google';
import { parseMetaInsight, type InsightRow } from './meta-parse';

export const META_VERSION = process.env.META_API_VERSION || 'v26.0';

/** Meta Ads daily insights, last 30 days, for every client with an ad account. */
export async function syncMeta(): Promise<string> {
  const token = await getSecret('meta.access_token');
  if (!token) throw new Error('not configured');
  const clients = await q<{ id: string; meta_ad_account_id: string }>(`SELECT id, meta_ad_account_id FROM clients WHERE meta_ad_account_id <> ''`);
  for (const c of clients) {
    const act = c.meta_ad_account_id.startsWith('act_') ? c.meta_ad_account_id : `act_${c.meta_ad_account_id}`;
    let url: string | null =
      `https://graph.facebook.com/${META_VERSION}/${act}/insights?` +
      new URLSearchParams({ fields: 'spend,impressions,clicks,actions,action_values', time_increment: '1', date_preset: 'last_30d', limit: '100', access_token: token });
    while (url) {
      const res: Response = await fetch(url, { cache: 'no-store' });
      const json = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message: string } };
      if (!res.ok || json.error) throw new Error(`Meta ${act}: ${json.error?.message ?? res.status}`);
      for (const r of json.data ?? []) await upsertAdDay(c.id, 'meta', r.date_start, parseMetaInsight(r));
      url = json.paging?.next ?? null;
    }
  }
  return `${clients.length} ad accounts`;
}
