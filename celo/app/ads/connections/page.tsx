import Link from 'next/link';
import { Badge, Empty, PageHeader, Panel } from '@/components/ui';
import { AddConnectionForm, ConnectionButtons, LinkSelect } from '@/components/ads/ConnectionForms';
import { fmtAgo } from '@/components/format';
import { clientOptions } from '@/lib/queries';
import { listAccounts, listConnections, migrateLegacyToken, REQUIRED_SCOPES } from '@/lib/meta/connections';
import { saveAccountTargets } from '@/lib/meta/ui-actions';

export const metadata = { title: 'Meta connections' };
export const dynamic = 'force-dynamic';

const STATUS = { ok: ['good', 'Connected'], needs_permission: ['warn', 'Needs permission'], invalid: ['bad', 'Token rejected'], unchecked: ['muted', 'Not checked'] } as const;
const ACCOUNT_STATUS: Record<number, string> = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending review', 9: 'Grace period', 101: 'Closed' };

export default async function Connections() {
  await migrateLegacyToken().catch(() => undefined);
  const [connections, accounts, clients] = await Promise.all([listConnections(), listAccounts(), clientOptions()]);
  return (
    <>
      <div className="mb-2 text-[12px]">
        <Link href="/ads" className="text-faint hover:text-muted">Ads</Link>
      </div>
      <PageHeader eyebrow="Meta" title="Connections" />

      <Panel title="Add a Meta Business" icon="plug">
        <AddConnectionForm />
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          In Meta Business Settings: Users → System users → add one (Admin), assign it the ad accounts and Pages you manage, then Generate token with{' '}
          <code className="text-muted">{REQUIRED_SCOPES.join(', ')}</code> plus <code className="text-muted">pages_show_list, pages_read_engagement</code> (for choosing a Page when creating ads). System-user tokens do not expire. Each Business you
          work in (yours, a partner's like Takeover Media) is its own connection; tokens are stored encrypted and only used for that Business's accounts.
        </p>
      </Panel>

      <Panel title={`Connections · ${connections.length}`} icon="plug" className="mt-4" pad={false}>
        {connections.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Permissions</th>
                <th>Ad accounts</th>
                <th>Checked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="text-[14px]">{c.label}</div>
                    {c.meta_user_name && <div className="text-[11.5px] text-faint">{c.meta_user_name}</div>}
                  </td>
                  <td>
                    <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge>
                    {c.status !== 'ok' && <div className="mt-1 max-w-[280px] text-[11.5px] text-muted">{c.message}</div>}
                  </td>
                  <td className="max-w-[260px] text-[11.5px] text-muted">
                    {REQUIRED_SCOPES.map((s) => (
                      <span key={s} className={`mr-2 ${c.scopes.includes(s) ? 'text-good' : 'text-bad'}`}>{c.scopes.includes(s) ? '✓' : '✕'} {s}</span>
                    ))}
                  </td>
                  <td className="num text-[15px]">{c.account_count}</td>
                  <td className="text-[12px] text-faint">{fmtAgo(c.checked_at)}</td>
                  <td className="text-right"><ConnectionButtons id={c.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><Empty>No Meta connections yet.</Empty></div>
        )}
      </Panel>

      <Panel title={`Ad accounts · ${accounts.length}`} icon="ads" className="mt-4" pad={false}>
        {accounts.length ? (
          <div className="divide-y divide-line/60">
            {accounts.map((a) => (
              <div key={a.id} className="grid gap-4 p-5 lg:grid-cols-[1.3fr_1fr_2fr]">
                <div className="min-w-0">
                  <Link href={`/ads?account=${a.id}`} className="text-[14px] text-ink hover:text-accent-hi">{a.name}</Link>
                  <div className="text-[11.5px] text-faint">
                    {a.id} · {a.currency} · {ACCOUNT_STATUS[a.account_status] ?? `status ${a.account_status}`}
                    {a.business_name ? ` · ${a.business_name}` : ''} · via {a.connection_label}
                  </div>
                  <div className={`mt-1 text-[11.5px] ${a.sync_message.startsWith('error') ? 'text-bad' : 'text-faint'}`}>{a.last_synced_at ? `Synced ${fmtAgo(a.last_synced_at)}: ${a.sync_message}` : a.sync_message || 'Not synced yet'}</div>
                </div>
                <div>
                  <div className="eyebrow mb-1.5">Client</div>
                  <LinkSelect accountId={a.id} clientId={a.client_id} clients={clients} />
                  {!a.client_id && <p className="mt-1 text-[11px] text-faint">Linked accounts sync daily and appear on the client's page.</p>}
                </div>
                <form action={saveAccountTargets} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
                  <input type="hidden" name="account_id" value={a.id} />
                  <div>
                    <label className="label">Result counted</label>
                    <select name="result_event" defaultValue={a.result_event} className="field py-1.5 text-[12.5px]">
                      <option value="">By campaign objective</option>
                      <option value="lead">Leads (Meta forms)</option>
                      <option value="offsite_conversion.fb_pixel_lead">Leads (pixel)</option>
                      <option value="omni_purchase">Purchases</option>
                      <option value="onsite_conversion.messaging_conversation_started_7d">Conversations</option>
                      <option value="link_click">Link clicks</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Target CPA</label>
                    <input name="target_cpa" defaultValue={a.target_cpa_cents != null ? (a.target_cpa_cents / 100).toString() : ''} placeholder="45" inputMode="decimal" className="field py-1.5 text-[12.5px]" />
                  </div>
                  <div>
                    <label className="label">Target ROAS</label>
                    <input name="target_roas" defaultValue={a.target_roas ?? ''} placeholder="3" inputMode="decimal" className="field py-1.5 text-[12.5px]" />
                  </div>
                  <div>
                    <label className="label">Max freq.</label>
                    <input name="frequency_ceiling" defaultValue={a.frequency_ceiling ?? ''} placeholder="3" inputMode="decimal" className="field py-1.5 text-[12.5px]" />
                  </div>
                  <button className="btn-ghost justify-center px-2.5 py-1.5">Save</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5"><Empty>Ad accounts appear here once a connection is added.</Empty></div>
        )}
      </Panel>
    </>
  );
}
