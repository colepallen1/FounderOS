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
