/**
 * Revenue forecast: every charge we expect between `from` and `from + days`.
 * Pure (no I/O) and unit tested. Gross amounts: Stripe tax and discounts are
 * not applied, and nothing is assumed about clients who have not signed.
 */
export type BillingItem = { amount_cents: number; interval: 'day' | 'week' | 'month' | 'year'; interval_count: number; period_end: string | null };

export type ForecastSub = {
  id: string;
  label: string;
  client_slug: string | null;
  status: string; // active | past_due | trialing | paused | canceled ...
  items: BillingItem[];
  trial_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean;
};

export type ManualRetainer = { label: string; client_slug: string; cents: number; anchor_day: number };

export type ForecastCharge = { date: string; cents: number; label: string; client_slug: string | null; kind: 'renewal' | 'first' | 'manual' };

const DAY = 86400000;

function step(d: Date, interval: BillingItem['interval'], count: number, anchorDay: number): Date {
  const n = new Date(d);
  if (interval === 'day') n.setUTCDate(n.getUTCDate() + count);
  else if (interval === 'week') n.setUTCDate(n.getUTCDate() + 7 * count);
  else {
    const months = interval === 'year' ? 12 * count : count;
    const y = n.getUTCFullYear();
    const m = n.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    n.setUTCFullYear(y, m, Math.min(anchorDay, last));
  }
  return n;
}

export function forecastCharges(subs: ForecastSub[], manual: ManualRetainer[], from: Date, days: number): ForecastCharge[] {
  const end = new Date(from.getTime() + days * DAY);
  const out: ForecastCharge[] = [];
  for (const s of subs) {
    if (!['active', 'past_due', 'trialing'].includes(s.status)) continue;
    const stopAt = s.cancel_at ? new Date(s.cancel_at) : null;
    for (const it of s.items) {
      if (!it.amount_cents || !it.period_end) continue;
      // A trial's first charge lands when the trial ends; afterwards, at each period end.
      let next = new Date(s.status === 'trialing' && s.trial_end ? s.trial_end : it.period_end);
      const anchorDay = next.getUTCDate();
      // Set to cancel at period end: the current period is already paid, nothing more comes in.
      if (s.cancel_at_period_end) continue;
      let first = s.status === 'trialing';
      for (let guard = 0; guard < 400 && next <= end; guard++) {
        if (stopAt && next >= stopAt) break;
        if (next >= from) {
          out.push({ date: next.toISOString().slice(0, 10), cents: it.amount_cents, label: s.label, client_slug: s.client_slug, kind: first ? 'first' : 'renewal' });
        }
        first = false;
        next = step(next, it.interval, Math.max(1, it.interval_count), anchorDay);
      }
    }
  }
  for (const m of manual) {
    if (!m.cents) continue;
    const day = Math.min(Math.max(1, m.anchor_day), 28);
    let next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day));
    if (next < from) next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, day));
    while (next <= end) {
      out.push({ date: next.toISOString().slice(0, 10), cents: m.cents, label: m.label, client_slug: m.client_slug, kind: 'manual' });
      next = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, day));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);
}

export function sumWithin(charges: ForecastCharge[], from: Date, days: number): number {
  const cut = new Date(from.getTime() + days * DAY).toISOString().slice(0, 10);
  return charges.filter((c) => c.date <= cut).reduce((s, c) => s + c.cents, 0);
}

/** Totals per calendar month for the `months` months starting with from's month. */
export function forecastByMonth(charges: ForecastCharge[], from: Date, months: number): { key: string; label: string; cents: number }[] {
  const out: { key: string; label: string; cents: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), cents: charges.filter((c) => c.date.startsWith(key)).reduce((s, c) => s + c.cents, 0) });
  }
  return out;
}
