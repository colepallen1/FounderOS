import { describe, expect, it } from 'vitest';
import { assessFatigue, compare, dailyPacing, resultsFor, totals, windowEnding, type Row } from '@/lib/meta/analysis';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10); // 2026-10-01 + n
const row = (n: number, o: Partial<Row> = {}): Row => ({ day: day(n), ad_id: 'a1', adset_id: 's1', campaign_id: 'c1', spend: 100, impressions: 10000, clicks: 250, link_clicks: 200, results: 10, value: 0, ...o });

describe('totals', () => {
  it('computes rates from sums, never averages of rates', () => {
    const t = totals([row(0, { spend: 100, impressions: 1000, link_clicks: 100 }), row(1, { spend: 100, impressions: 9000, link_clicks: 100 })]);
    expect(t.ctr).toBeCloseTo(2); // 200 / 10000, not mean(10%, 1.11%)
    expect(t.cpm).toBeCloseTo(20);
    expect(t.cpa).toBeCloseTo(10);
    expect(t.roas).toBeNull();
    expect(t.days).toBe(2);
  });
});

describe('compare', () => {
  it('labels noise, signal and insufficient volume, and reads the chain', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row(i, { spend: 100, impressions: 10000, link_clicks: 200, results: 10 })),
      // second week: same CPM, CTR down 40%, so CPC up
      ...Array.from({ length: 7 }, (_, i) => row(7 + i, { spend: 100, impressions: 10000, link_clicks: 120, results: 6 })),
    ];
    const c = compare(rows, windowEnding(day(13), 7));
    expect(c.changes.spend.classification).toBe('observed');
    expect(c.changes.cpm.classification).toBe('noise');
    expect(c.changes.ctr.classification).toBe('signal');
    expect(c.changes.ctr.direction).toBe('down');
    expect(c.changes.cpc.direction).toBe('up');
    expect(c.chain).toMatch(/creative is losing attention/);
    expect(c.notes).toEqual([]);
  });
  it('refuses to call result-rate moves on thin volume', () => {
    const rows = [row(0, { results: 2 }), row(1, { results: 9 })];
    const c = compare(rows, windowEnding(day(1), 1));
    expect(c.changes.cpa.classification).toBe('insufficient');
    expect(c.notes).toEqual([]);
  });
  it('notes missing days', () => {
    const c = compare([row(5)], windowEnding(day(5), 3));
    expect(c.notes.length).toBe(2);
  });
});

describe('assessFatigue', () => {
  const healthy = (n: number) => row(n, { impressions: 10000, link_clicks: 150 }); // 1.5% CTR
  const tired = (n: number) => row(n, { impressions: 10000, link_clicks: 90 }); // 0.9% CTR, -40%

  it("compares an ad with its own best earlier window and dates the decline", () => {
    const rows = [...Array.from({ length: 14 }, (_, i) => healthy(i)), ...Array.from({ length: 7 }, (_, i) => tired(14 + i))];
    const r = assessFatigue(rows, { days: 7, frequencyCeiling: 3, windowFrequency: { a1: 3.4 } });
    const a = r.ads[0];
    expect(a.status).toBe('assessed');
    expect(a.ctr_change_pct).toBeCloseTo(-40);
    expect(a.declined).toBe(true);
    expect(a.fatigued).toBe(true); // frequency 3.4 > 3 and CTR down 40%
    expect(a.decline_started).toBe(day(14));
    expect(a.spend_since_decline).toBe(700);
  });
  it('says insufficient below the click floor instead of inventing a number', () => {
    const r = assessFatigue([row(0, { link_clicks: 40 }), row(8, { link_clicks: 30 })], { days: 7 });
    expect(r.ads[0].status).toBe('insufficient');
    expect(r.ads[0].reason).toMatch(/click floor/);
  });
  it('leaves frequency unknown without a ceiling or a window reach row', () => {
    const rows = [...Array.from({ length: 14 }, (_, i) => healthy(i)), ...Array.from({ length: 7 }, (_, i) => tired(14 + i))];
    const a = assessFatigue(rows, { days: 7 }).ads[0];
    expect(a.conditions.find((c) => c.name === 'frequency')?.status).toBe('unknown');
    expect(a.fatigued).toBe(false);
  });
  it('flags when every ad in a set declined together', () => {
    const mk = (id: string) => [...Array.from({ length: 14 }, (_, i) => ({ ...healthy(i), ad_id: id })), ...Array.from({ length: 7 }, (_, i) => ({ ...tired(14 + i), ad_id: id }))];
    const r = assessFatigue([...mk('a1'), ...mk('a2')], { days: 7 });
    expect(r.notes.some((n) => /declined together/.test(n))).toBe(true);
  });
});

describe('pacing and results', () => {
  it('measures spend against a daily budget', () => {
    const p = dailyPacing({ [day(0)]: 50, [day(1)]: 20, [day(2)]: 70 }, 50, windowEnding(day(2), 3));
    expect(p.utilisation).toBeCloseTo(93.33, 1);
    expect(p.under).toEqual([day(1)]);
    expect(p.over).toEqual([day(2)]);
  });
  it('counts the first alias for the objective, never several', () => {
    expect(resultsFor({ lead: 7, 'onsite_conversion.lead_grouped': 7 }, {}, 'OUTCOME_LEADS', '')).toEqual({ results: 7, value: 0 });
    expect(resultsFor({ omni_purchase: 3, purchase: 3 }, { omni_purchase: 450 }, 'OUTCOME_SALES', '')).toEqual({ results: 3, value: 450 });
    expect(resultsFor({ lead: 7, 'offsite_conversion.fb_pixel_lead': 5 }, {}, 'OUTCOME_LEADS', 'offsite_conversion.fb_pixel_lead').results).toBe(5);
  });
});
