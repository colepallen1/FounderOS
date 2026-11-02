import { describe, expect, it } from 'vitest';
import { emailDomain, parseDomains, slugify } from '@/lib/slug';
import { parseMetaInsight } from '@/lib/integrations/meta-parse';

describe('slug and domains', () => {
  it('slugifies names', () => {
    expect(slugify('Acme Dental Group, LLC')).toBe('acme-dental-group-llc');
    expect(slugify('Café Noir')).toBe('cafe-noir');
    expect(slugify('***')).toBe('client');
  });
  it('extracts domains from mixed input', () => {
    expect(parseDomains('https://www.Acme.com/about, dana@acmedental.co  bad, acme.com')).toEqual(['acme.com', 'acmedental.co']);
    expect(parseDomains('owner@gmail.com, acme.com, x@icloud.com')).toEqual(['acme.com']);
    expect(emailDomain('Dana <dana@Acme.com>')).toBe('acme.com');
  });
});

describe('parseMetaInsight', () => {
  it('converts spend to cents and avoids double-counting purchase aliases', () => {
    const r = parseMetaInsight({
      date_start: '2026-11-01',
      spend: '123.45',
      impressions: '10000',
      clicks: '250',
      actions: [
        { action_type: 'lead', value: '7' },
        { action_type: 'omni_purchase', value: '3' },
        { action_type: 'purchase', value: '3' },
      ],
      action_values: [{ action_type: 'omni_purchase', value: '450.10' }],
    });
    expect(r).toEqual({ spend: 12345, impressions: 10000, clicks: 250, conversions: 10, value: 45010 });
  });
});

import { checkBudgetChange, minorUnits, parsePerf } from '@/lib/integrations/meta-parse';

describe('Meta controls', () => {
  it('budgets are in cents for USD, whole units for JPY', () => {
    expect(minorUnits('USD')).toBe(100);
    expect(minorUnits('jpy')).toBe(1);
  });
  it('guards budget changes', () => {
    expect(checkBudgetChange(5000, 7500, 100)).toBeNull(); // $50 -> $75
    expect(checkBudgetChange(5000, 50, 100)).toMatch(/at least/); // $0.50
    expect(checkBudgetChange(5000, 30000, 100)).toMatch(/5x/); // $50 -> $300
    expect(checkBudgetChange(5000, 900, 100)).toMatch(/fifth/); // $50 -> $9
    expect(checkBudgetChange(null, 2000, 100)).toBeNull();
    expect(checkBudgetChange(5000, NaN, 100)).toMatch(/at least/);
  });
  it('reads spend and cost per result from insights', () => {
    expect(parsePerf({ data: [{ date_start: '2026-10-27', spend: '210.00', actions: [{ action_type: 'lead', value: '14' }] }] })).toEqual({ spend_cents: 21000, results: 14, cost_per_result_cents: 1500 });
    expect(parsePerf(undefined)).toEqual({ spend_cents: 0, results: 0, cost_per_result_cents: null });
  });
});
