import { describe, expect, it } from 'vitest';
import { forecastByMonth, forecastCharges, sumWithin, type ForecastSub } from '@/lib/forecast';

const from = new Date('2026-11-02T12:00:00Z');
const sub = (o: Partial<ForecastSub> & Pick<ForecastSub, 'items'>): ForecastSub => ({
  id: 's', label: 'Client', client_slug: null, status: 'active', trial_end: null, cancel_at: null, cancel_at_period_end: false, ...o,
});

describe('forecastCharges', () => {
  it('steps monthly and biweekly retainers forward', () => {
    const c = forecastCharges(
      [
        sub({ label: 'Monthly', items: [{ amount_cents: 175000, interval: 'month', interval_count: 1, period_end: '2026-11-30T15:00:00Z' }] }),
        sub({ label: 'Biweekly', items: [{ amount_cents: 258000, interval: 'week', interval_count: 2, period_end: '2026-11-04T05:00:00Z' }] }),
      ],
      [],
      from,
      30,
    );
    expect(c.map((x) => `${x.date} ${x.label}`)).toEqual(['2026-11-04 Biweekly', '2026-11-18 Biweekly', '2026-11-30 Monthly', '2026-12-02 Biweekly']);
  });

  it('counts a trial from the day billing begins (new client, Nov 9)', () => {
    const c = forecastCharges(
      [sub({ status: 'trialing', trial_end: '2026-11-09T19:13:13Z', items: [{ amount_cents: 60000, interval: 'month', interval_count: 1, period_end: '2026-11-09T19:13:13Z' }] })],
      [],
      from,
      45,
    );
    expect(c).toEqual([
      expect.objectContaining({ date: '2026-11-09', cents: 60000, kind: 'first' }),
      expect.objectContaining({ date: '2026-12-09', cents: 60000, kind: 'renewal' }),
    ]);
  });

  it('drops subscriptions set to cancel, stops at cancel_at, and skips paused or canceled', () => {
    const items = [{ amount_cents: 1000, interval: 'month' as const, interval_count: 1, period_end: '2026-11-10T00:00:00Z' }];
    expect(forecastCharges([sub({ cancel_at_period_end: true, items })], [], from, 90)).toEqual([]);
    expect(forecastCharges([sub({ status: 'paused', items }), sub({ status: 'canceled', items })], [], from, 90)).toEqual([]);
    expect(forecastCharges([sub({ cancel_at: '2026-12-15T00:00:00Z', items })], [], from, 90).map((x) => x.date)).toEqual(['2026-11-10', '2026-12-10']);
  });

  it('keeps month-end anchors and includes manual retainers', () => {
    const c = forecastCharges(
      [sub({ items: [{ amount_cents: 500, interval: 'month', interval_count: 1, period_end: '2027-01-31T00:00:00Z' }] })],
      [{ label: 'Wire client', client_slug: 'w', cents: 300000, anchor_day: 5 }],
      new Date('2027-01-20T00:00:00Z'),
      70,
    );
    expect(c.filter((x) => x.kind !== 'manual').map((x) => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(c.filter((x) => x.kind === 'manual').map((x) => x.date)).toEqual(['2027-02-05', '2027-03-05']);
  });

  it('totals by window and by month', () => {
    const c = forecastCharges([sub({ items: [{ amount_cents: 100, interval: 'week', interval_count: 2, period_end: '2026-11-04T00:00:00Z' }] })], [], from, 120);
    expect(sumWithin(c, from, 30)).toBe(300); // Nov 4, Nov 18, Dec 2
    const m = forecastByMonth(c, from, 3);
    expect(m.map((x) => [x.key, x.cents])).toEqual([['2026-11', 200], ['2026-12', 300], ['2027-01', 200]]);
  });
});
