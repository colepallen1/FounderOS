import { NextResponse } from 'next/server';
import { getClientBySlug, todayInTz } from '@/lib/queries';
import { parseRange, rowsFor, structure } from '@/lib/meta/data';
import { clientAccounts } from '@/lib/meta/connections';
import { totals } from '@/lib/meta/analysis';

export const dynamic = 'force-dynamic';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Daily rows per campaign for one client. Signed-in only (middleware). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const c = await getClientBySlug(sp.get('client') ?? '');
  if (!c) return NextResponse.json({ error: 'unknown client' }, { status: 404 });
  const range = parseRange({ since: sp.get('since') ?? undefined, until: sp.get('until') ?? undefined, range: sp.get('range') ?? '30' }, todayInTz());
  const ids = (await clientAccounts(c.id)).map((a) => a.id);
  const [rows, { campaigns }] = await Promise.all([rowsFor(ids, range), structure(ids)]);
  const names = new Map(campaigns.map((x) => [x.id, x.name]));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(`${r.day}|${r.campaign_id}`, [...(groups.get(`${r.day}|${r.campaign_id}`) ?? []), r]);
  const lines = [['date', 'campaign', 'spend', 'impressions', 'link_clicks', 'results', 'conversion_value', 'cost_per_result', 'ctr_pct', 'roas'].join(',')];
  for (const [k, g] of [...groups].sort()) {
    const [day, cid] = k.split('|');
    const t = totals(g);
    lines.push([day, names.get(cid) ?? cid, t.spend.toFixed(2), t.impressions, t.link_clicks, t.results, t.value.toFixed(2), t.cpa?.toFixed(2) ?? '', t.ctr?.toFixed(3) ?? '', t.roas?.toFixed(3) ?? ''].map(esc).join(','));
  }
  return new NextResponse(lines.join('\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${c.slug}-${range.since}-to-${range.until}.csv"` },
  });
}
