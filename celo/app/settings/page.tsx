import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { SyncAllButton } from '@/components/SyncAllButton';
import { Badge, PageHeader, Panel } from '@/components/ui';
import { fmtAgo } from '@/components/format';
import { clearSecret, saveSecrets } from '@/lib/actions';
import { appPassword, appSecret } from '@/lib/config';
import { databaseUrl } from '@/lib/db';
import { GOOGLE_ADS_VERSION, googleRedirectUri } from '@/lib/integrations/google';
import { MODEL as AI_MODEL } from '@/lib/ai/ads-analyst';
import { getSecret, getSetting, mask, secretSource, type SecretKey } from '@/lib/settings';
import { SOURCES, configured, syncRuns } from '@/lib/sync';

export const metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

async function SecretField({ k, label, hint, placeholder }: { k: SecretKey; label: string; hint?: ReactNode; placeholder?: string }) {
  const [src, value] = await Promise.all([secretSource(k), getSecret(k)]);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="label mb-0" htmlFor={k}>
          {label}
        </label>
        {src === 'env' && <Badge tone="accent">From env</Badge>}
        {src === 'saved' && <Badge tone="good">Saved</Badge>}
      </div>
      <div className="flex gap-2">
        <input id={k} name={k} type="password" autoComplete="off" disabled={src === 'env'} placeholder={src ? mask(value) : placeholder} className="field font-mono text-[13px]" />
        {src === 'saved' && (
          <button formAction={clearSecret.bind(null, k)} className="btn-ghost px-2.5" aria-label={`Remove ${label}`} title="Remove">
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

function Copy({ value }: { value: string }) {
  return <code className="block overflow-x-auto whitespace-nowrap border border-line bg-bg/60 px-2.5 py-1.5 font-mono text-[12px] text-accent-hi">{value}</code>;
}

function StatusBadge({ on, label = 'Connected' }: { on: boolean; label?: string }) {
  return on ? <Badge tone="good" icon="check">{label}</Badge> : <Badge tone="muted" icon="plug">Not configured</Badge>;
}

export default async function Settings({ searchParams }: { searchParams: { google?: string } }) {
  const h = headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const [conn, runs, googleEmail, gid, gsec, claude] = await Promise.all([configured(), syncRuns(), getSetting('google.email'), getSecret('google.client_id'), getSecret('google.client_secret'), getSecret('anthropic.api_key')]);
  const webhook = await syncRuns().then((r) => r.get('stripe_webhook' as never));
  const webhookStatus = await getSetting('stripe.webhook_status');
  const g = searchParams.google;
  const vaultOk = Boolean(appSecret());

  return (
    <>
      <PageHeader eyebrow="Plug in your sources" title="Integrations">
        <SyncAllButton />
      </PageHeader>

      {!vaultOk && (
        <div className="panel mb-4 border-bad/50 p-4 text-[13px] text-bad">CELO_SECRET is not set on the server, so keys cannot be saved here. Add it in Vercel, or set the keys as environment variables.</div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Stripe */}
        <Panel title="Stripe" icon="money" action={<StatusBadge on={conn.stripe} />}>
          <div id="stripe" className="space-y-5">
            <form action={saveSecrets} className="space-y-4">
              <SecretField
                k="stripe.secret_key"
                label="Restricted API key"
                placeholder="rk_live_..."
                hint={
                  <>
                    <a href="https://dashboard.stripe.com/apikeys/create" target="_blank" rel="noreferrer" className="link">
                      Create a restricted key
                    </a>{' '}
                    with <b className="text-muted">Read</b> on Customers, Charges, Subscriptions, Products and Prices, and <b className="text-muted">Write</b> on Webhook Endpoints. Saving it sets up the real-time webhook and imports your data automatically.
                  </>
                }
              />
              <SecretField k="stripe.webhook_secret" label="Webhook signing secret" placeholder="whsec_..." hint="Filled in automatically when the key can manage webhooks. Otherwise paste one here." />
              <button className="btn">Save Stripe</button>
            </form>
            <div className="space-y-2 border-t border-line/60 pt-4 text-[12.5px] text-muted">
              <div className="eyebrow">Webhook endpoint</div>
              <Copy value={`${origin}/api/webhooks/stripe`} />
              <p className="text-faint">Events: charge.*, customer.subscription.*, customer.*, invoice.paid, invoice.payment_failed, refund.*</p>
              {webhookStatus && <p className={/^Webhook created/.test(webhookStatus) ? 'text-good' : 'text-warn'}>{webhookStatus}</p>}
              {webhook?.last_ok_at && <p className="text-faint">Last webhook {fmtAgo(webhook.last_ok_at)} ({webhook.message})</p>}
            </div>
          </div>
        </Panel>

        {/* Google */}
        <Panel title="Google · Calendar, Gmail, Ads" icon="calendar" action={<StatusBadge on={conn.calendar} label={googleEmail ? googleEmail : 'Connected'} />}>
          <div id="google" className="space-y-5">
            {g && (
              <div className={`text-[13px] ${g === 'connected' ? 'text-good' : 'text-bad'}`}>
                {g === 'connected' ? 'Google connected. First sync is done.' : g === 'missing-client' ? 'Save the OAuth client ID and secret first.' : `Google said: ${g}`}
              </div>
            )}
            <form action={saveSecrets} className="space-y-4">
              <SecretField k="google.client_id" label="OAuth client ID" placeholder="1234-abc.apps.googleusercontent.com" />
              <SecretField k="google.client_secret" label="OAuth client secret" placeholder="GOCSPX-..." />
              <div className="text-[12.5px] text-muted">
                <div className="eyebrow mb-1.5">Authorized redirect URI</div>
                <Copy value={googleRedirectUri(origin)} />
              </div>
              <button className="btn">Save client</button>
            </form>
            <div className="flex flex-wrap items-center gap-3 border-t border-line/60 pt-4">
              {gid && gsec ? (
                <a href="/api/google/connect" className="btn">
                  <Icon name="plug" size={14} /> {conn.calendar ? 'Reconnect Google' : 'Connect Google'}
                </a>
              ) : (
                <span className="text-[12.5px] text-faint">Save the client ID and secret, then connect.</span>
              )}
              {conn.calendar && (
                <form>
                  <button formAction={clearSecret.bind(null, 'google.refresh_token')} className="btn-ghost">
                    Disconnect
                  </button>
                </form>
              )}
            </div>
            <form action={saveSecrets} className="space-y-4 border-t border-line/60 pt-4">
              <div className="flex items-center justify-between">
                <div className="eyebrow">Google Ads</div>
                <StatusBadge on={conn.google_ads} />
              </div>
              <SecretField k="google_ads.developer_token" label="Developer token" hint="Google Ads, Tools, API Center. Needs Basic access to read client accounts." />
              <SecretField k="google_ads.login_customer_id" label="Manager (MCC) account ID" placeholder="123-456-7890" hint="Only if client accounts sit under your manager account." />
              <button className="btn">Save Google Ads</button>
              <p className="text-[11px] text-faint">API {GOOGLE_ADS_VERSION}. Override with GOOGLE_ADS_API_VERSION.</p>
            </form>
          </div>
        </Panel>

        {/* Meta */}
        <Panel title="Meta Ads" icon="ads" action={<StatusBadge on={conn.meta} />}>
          <div id="meta" className="space-y-3 text-[13px] text-muted">
            <p>Meta now connects per Business Manager (yours, and each partner's), with every ad account linked to a client.</p>
            <a href="/ads/connections" className="btn">
              <Icon name="plug" size={14} /> Manage Meta connections
            </a>
            <p className="text-[11px] text-faint">A token saved here before is moved into a connection named "Default" automatically.</p>
          </div>
        </Panel>

        {/* Claude */}
        <Panel title="Claude · AI analysis" icon="target" action={<StatusBadge on={Boolean(claude)} />}>
          <form id="claude" action={saveSecrets} className="space-y-4">
            <SecretField
              k="anthropic.api_key"
              label="Anthropic API key"
              placeholder="sk-ant-..."
              hint={
                <>
                  From console.anthropic.com → API keys. Used for ad analysis, daily and weekly summaries. Model: {AI_MODEL}. Claude only reads numbers and proposes changes; nothing it suggests runs without your approval.
                </>
              }
            />
            <button className="btn">Save Claude</button>
          </form>
        </Panel>

        {/* Sync + deployment */}
        <Panel title="Sync status" icon="sync" pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Source</th>
                <th>Last good sync</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => {
                const r = runs.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="whitespace-nowrap text-muted">{conn[s.id] ? fmtAgo(r?.last_ok_at) : '-'}</td>
                    <td className="max-w-[240px] text-[12px]">
                      {!conn[s.id] ? <Badge tone="muted">Not configured</Badge> : r ? <span className={r.ok ? 'text-muted' : 'text-bad'}>{r.message || '-'}</span> : <span className="text-faint">Waiting</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="space-y-2 border-t border-line/60 p-5 text-[12.5px]">
            <div className="eyebrow mb-2">Server</div>
            <Check ok={Boolean(databaseUrl())} label="DATABASE_URL" note={databaseUrl() ? 'Postgres' : 'Local embedded database'} />
            <Check ok={Boolean(appPassword())} label="CELO_PASSWORD" note={appPassword() ? 'Login required' : 'No login'} />
            <Check ok={vaultOk && Boolean(process.env.CELO_SECRET)} label="CELO_SECRET" note="Signs sessions, encrypts saved keys" />
            <Check ok={Boolean(process.env.CRON_SECRET)} label="CRON_SECRET" note="Scheduled background sync" />
          </div>
        </Panel>
      </div>
    </>
  );
}

function Check({ ok, label, note }: { ok: boolean; label: string; note: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={ok ? 'text-good' : 'text-warn'}>
        <Icon name={ok ? 'check' : 'alert'} size={14} strokeWidth={2} />
      </span>
      <code className="font-mono text-[12px] text-ink">{label}</code>
      <span className="text-faint">{note}</span>
    </div>
  );
}
