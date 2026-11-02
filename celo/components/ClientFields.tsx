import { CLIENT_STATUSES, SERVICES, type Client } from '@/lib/types';

/** Profile fields shared by the create and edit forms (server rendered). */
export function ClientFields({ c, full, partners = [] }: { c?: Partial<Client>; full?: boolean; partners?: { id: string; name: string }[] }) {
  const services = new Set(c?.services ?? []);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">
          Client name
        </label>
        <input id="name" name="name" required defaultValue={c?.name} className="field" placeholder="Acme Dental Group" />
      </div>
      <div>
        <label className="label" htmlFor="status">
          Status
        </label>
        <select id="status" name="status" defaultValue={c?.status ?? 'onboarding'} className="field capitalize">
          {CLIENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="retainer">
          {c?.parent_id ? 'Monthly fee (USD)' : 'Monthly retainer (USD)'}
        </label>
        <input id="retainer" name="retainer" inputMode="decimal" defaultValue={c?.retainer_cents ? (c.retainer_cents / 100).toString() : ''} className="field" placeholder="3500" />
        <p className="mt-1.5 text-[11.5px] text-faint">Used for clients not billed through Stripe. Linked Stripe subscriptions override it.</p>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Services</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent/70 has-[:checked]:bg-accent/10 has-[:checked]:text-accent-hi" style={{ borderRadius: 'var(--radius)' }}>
              <input type="checkbox" name="services" value={s} defaultChecked={services.has(s)} className="accent-[rgb(var(--accent))]" />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="contact_name">
          Main contact
        </label>
        <input id="contact_name" name="contact_name" defaultValue={c?.contact_name} className="field" placeholder="Dana Reyes" />
      </div>
      <div>
        <label className="label" htmlFor="contact_email">
          Contact email
        </label>
        <input id="contact_email" name="contact_email" type="email" defaultValue={c?.contact_email} className="field" placeholder="dana@acme.com" />
      </div>
      <div>
        <label className="label" htmlFor="website">
          Website
        </label>
        <input id="website" name="website" defaultValue={c?.website} className="field" placeholder="acme.com" />
      </div>
      <div>
        <label className="label" htmlFor="start_date">
          Start date
        </label>
        <input id="start_date" name="start_date" type="date" defaultValue={c?.start_date ?? ''} className="field" />
      </div>
      {full && (
        <>
          <div>
            <label className="label" htmlFor="renewal_date">
              Contract renewal
            </label>
            <input id="renewal_date" name="renewal_date" type="date" defaultValue={c?.renewal_date ?? ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="email_domains">
              Email domains
            </label>
            <input id="email_domains" name="email_domains" defaultValue={(c?.email_domains ?? []).join(', ')} className="field" placeholder="acme.com, acmedental.co" />
            <p className="mt-1.5 text-[11.5px] text-faint">Gmail threads and calendar invites from these domains appear on this client.</p>
          </div>
          <div>
            <label className="label" htmlFor="meta_ad_account_id">
              Meta ad account ID
            </label>
            <input id="meta_ad_account_id" name="meta_ad_account_id" defaultValue={c?.meta_ad_account_id} className="field" placeholder="act_1234567890" />
          </div>
          <div>
            <label className="label" htmlFor="parent_id">
              Billed through
            </label>
            <select id="parent_id" name="parent_id" defaultValue={c?.parent_id ?? ''} className="field">
              <option value="">Bills Celo directly</option>
              {partners
                .filter((p) => p.id !== c?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-faint">For a partner's client: its fee is shown, but revenue counts once, on the partner.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 self-center text-[13px]">
            <input type="checkbox" name="is_partner" defaultChecked={c?.is_partner} className="mt-0.5 accent-[rgb(var(--accent))]" />
            <span>
              Partner with its own clients
              <span className="block text-[11.5px] text-faint">e.g. an agency that pays you to run ads for its clients</span>
            </span>
          </label>
          <div>
            <label className="label" htmlFor="google_ads_customer_id">
              Google Ads customer ID
            </label>
            <input id="google_ads_customer_id" name="google_ads_customer_id" defaultValue={c?.google_ads_customer_id} className="field" placeholder="123-456-7890" />
          </div>
        </>
      )}
    </div>
  );
}
