import 'server-only';
import { q, newId } from '../db';
import { toDay } from '../recurring';
import type { AdAccount } from './connections';
import { assessFatigue, compare, dailyPacing, inWindow, totals, windowEnding } from './analysis';
import { rowsFor, structure, windowReach } from './data';
import { propose } from './actions';

type Severity = 'info' | 'warn' | 'bad';

async function alert(a: AdAccount, kind: string, severity: Severity, objectId: string, objectName: string, message: string, data: Record<string, unknown>, day: string) {
  await q(
    `INSERT INTO meta_alerts (id, account_id, client_id, kind, severity, object_id, object_name, message, data, day)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (account_id, kind, object_id, day) DO UPDATE SET message = EXCLUDED.message, data = EXCLUDED.data, severity = EXCLUDED.severity`,
    [newId('alr'), a.id, a.client_id, kind, severity, objectId, objectName, message, JSON.stringify(data), day],
  );
}

const money = (n: number, cur: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);

/** Deterministic checks over the last 7 days (vs the 7 before). Alerts are raised; fixes are only proposed. */
export async function runRules(a: AdAccount): Promise<{ alerts: number; proposals: number }> {
  const today = toDay(new Date());
  const w = windowEnding(today, 7);
  const rows = await rowsFor([a.id], { since: windowEnding(today, 42).start, until: today });
  const { campaigns, ads } = await structure([a.id]);
  const cur = a.currency;
  const targetCpa = a.target_cpa_cents != null ? a.target_cpa_cents / 100 : null;
  let alerts = 0;
  let proposals = 0;

  for (const c of campaigns.filter((x) => x.status === 'ACTIVE')) {
    const t = totals(rows.filter((r) => r.campaign_id === c.id).filter(inWindow(w)));
    if (!t.spend) continue;
    const awareness = c.objective === 'OUTCOME_AWARENESS' || c.objective === 'OUTCOME_TRAFFIC';

    // Spend with nothing to show for it.
    const floor = targetCpa ? targetCpa * 2 : 75;
    if (!awareness && t.results === 0 && t.spend >= floor) {
      await alert(a, 'zero_results', 'bad', c.id, c.name, `${money(t.spend, cur)} spent in 7 days with no results.`, { spend: t.spend }, today);
      alerts++;
      if (await propose({ account_id: a.id, kind: 'pause', object_id: c.id, object_name: c.name, summary: `Pause "${c.name}"`, risk: 'material', source: 'rule', rationale: `${money(t.spend, cur)} spent over the last 7 days with zero results (floor ${money(floor, cur)}). Check tracking before deciding.` })) proposals++;
    }

    // Cost per result well above target, on enough volume to mean something.
    if (targetCpa && t.cpa != null && t.results >= 5 && t.cpa > targetCpa * 1.5) {
      await alert(a, 'high_cpa', 'warn', c.id, c.name, `Cost per result ${money(t.cpa, cur)} is ${Math.round((t.cpa / targetCpa - 1) * 100)}% over the ${money(targetCpa, cur)} target.`, { cpa: t.cpa, target: targetCpa }, today);
      alerts++;
      if (c.daily_budget && (await propose({ account_id: a.id, kind: 'budget', object_id: c.id, object_name: c.name, payload: { daily_budget: Math.round(c.daily_budget * 0.7), from: c.daily_budget }, summary: `Cut "${c.name}" daily budget ${money(c.daily_budget / 100, cur)} → ${money(Math.round(c.daily_budget * 0.7) / 100, cur)}`, risk: 'material', source: 'rule', rationale: `Cost per result ${money(t.cpa, cur)} vs target ${money(targetCpa, cur)} on ${t.results} results in 7 days.` }))) proposals++;
    }

    // ROAS below target.
    if (a.target_roas && t.roas != null && t.spend >= 100 && t.roas < a.target_roas * 0.7) {
      await alert(a, 'low_roas', 'warn', c.id, c.name, `ROAS ${t.roas.toFixed(2)}x is below the ${a.target_roas}x target.`, { roas: t.roas }, today);
      alerts++;
    }

    // Pacing: a daily-budget campaign that is not spending its budget (raising it would not help).
    if (c.daily_budget) {
      const byDay: Record<string, number> = {};
      for (const r of rows.filter((r) => r.campaign_id === c.id)) byDay[r.day] = (byDay[r.day] ?? 0) + r.spend;
      const p = dailyPacing(byDay, c.daily_budget / 100, w);
      if (p.under.length >= 3 && p.utilisation < 70) {
        await alert(a, 'underspend', 'info', c.id, c.name, `Spending ${Math.round(p.utilisation)}% of its daily budget (${p.under.length} of 7 days under 60%). A narrow audience or the learning phase is the usual cause; raising the budget would not help.`, { utilisation: p.utilisation }, today);
        alerts++;
      }
      // Winner: under target and spending what it is allowed to.
      if (targetCpa && t.cpa != null && t.results >= 10 && t.cpa < targetCpa * 0.7 && p.utilisation >= 90) {
        const next = Math.round(c.daily_budget * 1.2);
        if (await propose({ account_id: a.id, kind: 'budget', object_id: c.id, object_name: c.name, payload: { daily_budget: next, from: c.daily_budget }, summary: `Raise "${c.name}" daily budget ${money(c.daily_budget / 100, cur)} → ${money(next / 100, cur)} (+20%)`, risk: 'spend', source: 'rule', rationale: `Cost per result ${money(t.cpa, cur)} is ${Math.round((1 - t.cpa / targetCpa) * 100)}% under target on ${t.results} results, and it is spending ${Math.round(p.utilisation)}% of its budget.` })) proposals++;
      }
    }
  }

  // Creative fatigue (needs Meta's window frequency per ad).
  const reach = await windowReach(a.id, 'ad', { since: w.start, until: w.end });
  const freq = Object.fromEntries(Object.values(reach.rows).map((r) => [r.id, r.frequency]));
  const fatigue = assessFatigue(rows, { days: 7, end: today, frequencyCeiling: a.frequency_ceiling, windowFrequency: freq });
  for (const f of fatigue.ads.filter((x) => x.declined)) {
    const ad = ads.find((x) => x.id === f.ad_id);
    if (!ad || ad.status !== 'ACTIVE') continue;
    await alert(a, 'fatigue', f.fatigued ? 'bad' : 'warn', f.ad_id, ad.name, `CTR is ${Math.abs(Math.round(f.ctr_change_pct ?? 0))}% below this ad's own best week${f.spend_since_decline ? `; ${money(f.spend_since_decline, cur)} spent since the decline began` : ''}.`, { ...f }, today);
    alerts++;
  }

  // Account-level shift vs last week, when the rule table explains it.
  const cmp = compare(rows, w);
  if (cmp.chain) {
    await alert(a, 'shift', 'info', a.id, a.name, cmp.chain, { changes: cmp.changes }, today);
    alerts++;
  }
  return { alerts, proposals };
}
