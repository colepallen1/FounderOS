import Link from 'next/link';
import { createSubClient } from '@/lib/actions';
import { formatMoney } from '@/lib/money';
import type { ClientSummary } from '@/lib/queries';
import { fmtNum } from './format';
import { Icon } from './Icon';
import { Badge, Empty, Panel, STATUS_TONE, Stat } from './ui';

/** A partner's own clients (e.g. Takeover Media's), with fees reconciled against what the partner pays. */
export function PartnerClients({ partner, subs, pendingCents = 0, startsOn = null }: { partner: ClientSummary; subs: ClientSummary[]; pendingCents?: number; startsOn?: string | null }) {
  const live = subs.filter((s) => s.status === 'active' || s.status === 'onboarding');
  const allocated = live.reduce((t, s) => t + s.retainer_cents, 0);
  const billed = partner.mrr_cents + pendingCents;
  const gap = billed - allocated;
  const spend = subs.reduce((t, s) => t + s.ad_spend_30d_cents, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Clients" value={live.length} sub={subs.length > live.length ? `${subs.length - live.length} paused or churned` : 'All active'} />
        <Stat
          label={`${partner.name.split(' ')[0]} pays`}
          value={formatMoney(billed)}
          sub={
            pendingCents && startsOn
              ? `per month, via Stripe · starts ${startsOn}`
              : partner.mrr_source === 'stripe'
                ? 'per month, via Stripe'
                : partner.mrr_source === 'manual'
                  ? 'per month, manual'
                  : 'nothing billed yet'
          }
        />
        <Stat
          label="Allocated to clients"
          value={formatMoney(allocated)}
          tone={gap < 0 ? 'warn' : undefined}
          sub={gap === 0 ? 'Matches what is billed' : gap > 0 ? `${formatMoney(gap)} not assigned to a client` : `${formatMoney(-gap)} more than is billed`}
        />
        <Stat label="Ad spend · 30d" value={spend ? formatMoney(spend) : '-'} sub="across all their clients" />
      </div>

      <Panel title={`${partner.name} clients`} icon="clients" pad={false}>
        {subs.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="text-right">Fee / mo</th>
                  <th className="text-right">Ad spend 30d</th>
                  <th className="text-right">Results 30d</th>
                  <th className="text-right">Per result</th>
                  <th className="text-right">Open tasks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/clients/${s.slug}`} className="text-[14px] hover:text-accent-hi">
                        {s.name}
                      </Link>
                      {!s.meta_ad_account_id && <div className="text-[11px] text-warn">No ad account linked</div>}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                    </td>
                    <td className="num text-right text-[15px]">{s.retainer_cents ? formatMoney(s.retainer_cents) : <span className="text-faint">-</span>}</td>
                    <td className="num text-right text-[15px]">{s.ad_spend_30d_cents ? formatMoney(s.ad_spend_30d_cents) : <span className="text-faint">-</span>}</td>
                    <td className="num text-right text-[15px]">{s.ad_conv_30d ? fmtNum(s.ad_conv_30d, 1) : <span className="text-faint">-</span>}</td>
                    <td className="num text-right text-[15px]">{s.ad_conv_30d ? formatMoney(Math.round(s.ad_spend_30d_cents / s.ad_conv_30d), 'usd', { cents: true }) : <span className="text-faint">-</span>}</td>
                    <td className="num text-right text-[15px]">
                      {s.open_tasks}
                      {s.overdue_tasks > 0 && <span className="ml-1 text-[12px] text-bad">{s.overdue_tasks} late</span>}
                    </td>
                    <td className="text-right">
                      <Link href={`/clients/${s.slug}?tab=ads`} className="link inline-flex items-center gap-1 text-[12px]">
                        Ads <Icon name="arrowRight" size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty>No clients under {partner.name} yet. Add the first one below.</Empty>
          </div>
        )}
      </Panel>

      <Panel title={`Add a ${partner.name} client`} icon="plus">
        <form action={createSubClient} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_1.4fr_auto] lg:items-end">
          <input type="hidden" name="parent_id" value={partner.id} />
          <div>
            <label className="label">Client name</label>
            <input name="name" required placeholder="Bright Smile Dental" className="field" />
          </div>
          <div>
            <label className="label">Fee / mo (USD)</label>
            <input name="fee" inputMode="decimal" placeholder="600" className="field" />
          </div>
          <div>
            <label className="label">Meta ad account ID</label>
            <input name="meta_ad_account_id" placeholder="act_1234567890" className="field" />
          </div>
          <div>
            <label className="label">Website</label>
            <input name="website" placeholder="brightsmile.com" className="field" />
          </div>
          <button className="btn justify-center">
            <Icon name="plus" size={14} /> Add
          </button>
        </form>
        <p className="mt-3 text-[11.5px] text-faint">
          Each client gets its own page: Meta campaigns and budget controls, tasks, objectives and notes. Its fee shows here, while revenue is counted once, on {partner.name}.
        </p>
      </Panel>
    </div>
  );
}
