import 'server-only';
import { q, one, newId } from '../db';
import { appSecret } from '../config';
import { decryptSecret, encryptSecret } from '../token';
import { getSecret } from '../settings';
import { actId, graph, graphAll, GraphError } from './graph';

export const REQUIRED_SCOPES = ['ads_read', 'ads_management', 'business_management'] as const;

export type Connection = {
  id: string;
  label: string;
  meta_user_name: string;
  scopes: string[];
  status: 'ok' | 'needs_permission' | 'invalid' | 'unchecked';
  message: string;
  checked_at: string | null;
  account_count: number;
};

export type AdAccount = {
  id: string;
  connection_id: string;
  connection_label: string;
  client_id: string | null;
  client_name: string | null;
  client_slug: string | null;
  name: string;
  currency: string;
  timezone: string;
  account_status: number;
  business_name: string;
  result_event: string;
  target_cpa_cents: number | null;
  target_roas: number | null;
  frequency_ceiling: number | null;
  last_synced_at: string | null;
  sync_message: string;
};

function secret(): string {
  const s = appSecret();
  if (!s) throw new Error('CELO_SECRET is not set, so tokens cannot be stored.');
  return s;
}

export async function connectionToken(connectionId: string): Promise<string> {
  const row = await one<{ token_enc: string }>(`SELECT token_enc FROM meta_connections WHERE id = $1`, [connectionId]);
  if (!row) throw new Error('Meta connection not found.');
  const token = await decryptSecret(row.token_enc, secret());
  if (!token) throw new Error('Could not decrypt the Meta token (was CELO_SECRET changed?). Re-add the connection.');
  return token;
}

/** The token for an ad account: always the token of the connection that owns it. */
export async function accountToken(rawAct: string): Promise<{ token: string; account: AdAccount }> {
  const account = await getAccount(actId(rawAct));
  if (!account) throw new Error(`Ad account ${actId(rawAct)} is not connected. Add it under Ads → Connections.`);
  return { token: await connectionToken(account.connection_id), account };
}

/** Ask Meta who the token is and which permissions it holds, then store the verdict. */
export async function checkConnection(id: string): Promise<Connection['status']> {
  const token = await connectionToken(id);
  try {
    const me = await graph<{ id: string; name?: string }>(token, 'me', { params: { fields: 'id,name' } });
    const perms = await graph<{ data: { permission: string; status: string }[] }>(token, 'me/permissions');
    const scopes = perms.data.filter((p) => p.status === 'granted').map((p) => p.permission);
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    const status = missing.length ? 'needs_permission' : 'ok';
    await q(
      `UPDATE meta_connections SET meta_user_id = $2, meta_user_name = $3, scopes = $4, status = $5, message = $6, checked_at = now() WHERE id = $1`,
      [id, me.id, me.name ?? '', JSON.stringify(scopes), status, missing.length ? `Missing: ${missing.join(', ')}` : 'All permissions granted'],
    );
    return status;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof GraphError && err.kind === 'permission' ? 'needs_permission' : 'invalid';
    await q(`UPDATE meta_connections SET status = $2, message = $3, checked_at = now() WHERE id = $1`, [id, status, msg.slice(0, 500)]);
    return status;
  }
}

type RawAccount = { id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number; business?: { name?: string } };
const ACCOUNT_FIELDS = 'id,name,currency,timezone_name,account_status,business{name}';

/** Every ad account the token can reach: assigned to the system user, owned by its businesses, or shared to them by clients. */
export async function discoverAccounts(id: string): Promise<number> {
  const token = await connectionToken(id);
  const found = new Map<string, RawAccount>();
  const add = (list: RawAccount[]) => list.forEach((a) => found.set(actId(a.id), a));
  add(await graphAll<RawAccount>(token, 'me/adaccounts', { fields: ACCOUNT_FIELDS }));
  try {
    const businesses = await graphAll<{ id: string }>(token, 'me/businesses', { fields: 'id' });
    for (const b of businesses) {
      add(await graphAll<RawAccount>(token, `${b.id}/owned_ad_accounts`, { fields: ACCOUNT_FIELDS }).catch(() => []));
      add(await graphAll<RawAccount>(token, `${b.id}/client_ad_accounts`, { fields: ACCOUNT_FIELDS }).catch(() => []));
    }
  } catch {
    /* business_management missing: assigned accounts are still listed */
  }
  for (const [act, a] of found) {
    await q(
      `INSERT INTO meta_ad_accounts (id, connection_id, name, currency, timezone, account_status, business_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET connection_id = EXCLUDED.connection_id, name = EXCLUDED.name, currency = EXCLUDED.currency,
         timezone = EXCLUDED.timezone, account_status = EXCLUDED.account_status, business_name = EXCLUDED.business_name`,
      [act, id, a.name ?? act, a.currency ?? 'USD', a.timezone_name ?? '', a.account_status ?? 1, a.business?.name ?? ''],
    );
  }
  await linkLegacyClients();
  return found.size;
}

/** Clients that already had an ad account ID typed in (before connections existed) get linked to it. */
async function linkLegacyClients() {
  await q(
    `UPDATE meta_ad_accounts a SET client_id = c.id FROM clients c
     WHERE a.client_id IS NULL AND c.meta_ad_account_id <> '' AND a.id = 'act_' || regexp_replace(c.meta_ad_account_id, '^act_', '')`,
  );
}

export async function addConnection(label: string, token: string): Promise<{ id: string; status: Connection['status']; accounts: number }> {
  const id = newId('mcn');
  await q(`INSERT INTO meta_connections (id, label, token_enc) VALUES ($1,$2,$3)`, [id, label.trim() || 'Meta Business', await encryptSecret(token.trim(), secret())]);
  const status = await checkConnection(id);
  const accounts = status === 'invalid' ? 0 : await discoverAccounts(id).catch(() => 0);
  return { id, status, accounts };
}

/** The pre-connections single token (Integrations → Meta) becomes the "Default" connection, once. */
export async function migrateLegacyToken(): Promise<void> {
  const existing = await one<{ n: number }>(`SELECT count(*)::int AS n FROM meta_connections`);
  if (existing && existing.n > 0) return;
  const legacy = await getSecret('meta.access_token');
  if (!legacy) return;
  await addConnection('Default', legacy);
}

export async function listConnections(): Promise<Connection[]> {
  return q<Connection>(
    `SELECT c.id, c.label, c.meta_user_name, c.scopes, c.status, c.message, c.checked_at::text,
       (SELECT count(*)::int FROM meta_ad_accounts a WHERE a.connection_id = c.id) AS account_count
     FROM meta_connections c ORDER BY c.created_at`,
  );
}

const ACCOUNT_SELECT = `SELECT a.id, a.connection_id, mc.label AS connection_label, a.client_id, c.name AS client_name, c.slug AS client_slug,
  a.name, a.currency, a.timezone, a.account_status, a.business_name, a.result_event, a.target_cpa_cents, a.target_roas,
  a.frequency_ceiling, a.last_synced_at::text, a.sync_message
  FROM meta_ad_accounts a JOIN meta_connections mc ON mc.id = a.connection_id LEFT JOIN clients c ON c.id = a.client_id`;

export async function listAccounts(): Promise<AdAccount[]> {
  return q<AdAccount>(`${ACCOUNT_SELECT} ORDER BY c.name NULLS LAST, a.name`);
}

export async function getAccount(id: string): Promise<AdAccount | null> {
  return one<AdAccount>(`${ACCOUNT_SELECT} WHERE a.id = $1`, [id]);
}

/** A client's ad accounts. The only way pages read a client's ads data, so one client never sees another's. */
export async function clientAccounts(clientId: string): Promise<AdAccount[]> {
  return q<AdAccount>(`${ACCOUNT_SELECT} WHERE a.client_id = $1 ORDER BY a.name`, [clientId]);
}

export async function setAccountClient(accountId: string, clientId: string | null) {
  await q(`UPDATE meta_ad_accounts SET client_id = $2 WHERE id = $1`, [accountId, clientId]);
  // Keep the legacy single-account field in step so existing pages keep working.
  if (clientId) await q(`UPDATE clients SET meta_ad_account_id = regexp_replace($2, '^act_', '') WHERE id = $1 AND meta_ad_account_id = ''`, [clientId, accountId]);
}

export async function setAccountTargets(accountId: string, t: { result_event: string; target_cpa_cents: number | null; target_roas: number | null; frequency_ceiling: number | null }) {
  await q(`UPDATE meta_ad_accounts SET result_event = $2, target_cpa_cents = $3, target_roas = $4, frequency_ceiling = $5 WHERE id = $1`, [
    accountId,
    t.result_event,
    t.target_cpa_cents,
    t.target_roas,
    t.frequency_ceiling,
  ]);
}

export async function removeConnection(id: string) {
  await q(`DELETE FROM meta_connections WHERE id = $1`, [id]);
}
