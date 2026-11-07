import 'server-only';
import { q, one, newId } from '../db';
import { accountToken } from './connections';
import { graph } from './graph';
import { checkBudgetChange } from '../integrations/meta-parse';
import { getSetting } from '../settings';

/** Read-only mode (default ON): nothing is ever written to Meta, whatever is approved. */
export async function isReadOnly(): Promise<boolean> {
  return (await getSetting('meta.read_only')) !== 'off';
}

/**
 * The approval queue. Nothing here writes to Meta until execute() runs on an
 * approved action. Rules and Claude can only propose. (Approval model after
 * meta-ads-agent's "nothing spends without explicit approval", MIT.)
 */
export type ActionKind = 'pause' | 'resume' | 'budget' | 'duplicate' | 'rename' | 'targeting' | 'create_campaign' | 'activate';
export type Risk = 'spend' | 'material';
export type Source = 'you' | 'rule' | 'claude';

export type MetaAction = {
  id: string;
  account_id: string;
  client_id: string | null;
  client_name: string | null;
  kind: ActionKind;
  object_id: string;
  object_name: string;
  payload: Record<string, unknown>;
  summary: string;
  risk: Risk;
  source: Source;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  result: Record<string, unknown>;
  error: string;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
};

const SELECT = `SELECT x.id, x.account_id, x.client_id, c.name AS client_name, x.kind, x.object_id, x.object_name, x.payload, x.summary, x.risk, x.source,
  x.rationale, x.status, x.result, x.error, x.created_at::text, x.decided_at::text, x.executed_at::text
  FROM meta_actions x LEFT JOIN clients c ON c.id = x.client_id`;

export async function listActions(opts: { status?: string[]; clientId?: string; accountIds?: string[]; limit?: number } = {}): Promise<MetaAction[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.status) conds.push(`x.status = ANY($${params.push(opts.status)}::text[])`);
  if (opts.clientId) conds.push(`x.client_id = $${params.push(opts.clientId)}`);
  if (opts.accountIds) conds.push(`x.account_id = ANY($${params.push(opts.accountIds)}::text[])`);
  return q<MetaAction>(`${SELECT} ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY x.created_at DESC LIMIT ${Math.min(opts.limit ?? 50, 200)}`, params);
}

export async function getAction(id: string): Promise<MetaAction | null> {
  return one<MetaAction>(`${SELECT} WHERE x.id = $1`, [id]);
}

export async function propose(a: { account_id: string; kind: ActionKind; object_id?: string; object_name?: string; payload?: Record<string, unknown>; summary: string; risk: Risk; source: Source; rationale?: string }): Promise<string | null> {
  // One open proposal per object and kind: rules and Claude re-running do not pile up duplicates.
  if (a.object_id) {
    const open = await one(`SELECT 1 FROM meta_actions WHERE account_id = $1 AND kind = $2 AND object_id = $3 AND status = 'pending'`, [a.account_id, a.kind, a.object_id]);
    if (open) return null;
  }
  const id = newId('act');
  await q(
    `INSERT INTO meta_actions (id, account_id, client_id, kind, object_id, object_name, payload, summary, risk, source, rationale)
     VALUES ($1,$2,(SELECT client_id FROM meta_ad_accounts WHERE id = $2),$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, a.account_id, a.kind, a.object_id ?? '', a.object_name ?? '', JSON.stringify(a.payload ?? {}), a.summary, a.risk, a.source, a.rationale ?? ''],
  );
  return id;
}

export async function reject(id: string) {
  await q(`UPDATE meta_actions SET status = 'rejected', decided_at = now() WHERE id = $1 AND status = 'pending'`, [id]);
}

/** Approve and run. The claim (pending → approved) makes a double click or two tabs run it once. */
export async function approveAndExecute(id: string): Promise<MetaAction> {
  if (await isReadOnly()) throw new Error('Read-only mode is on: Celo Command does not change anything in Meta. Make this change in Ads Manager.');
  const claimed = await q(`UPDATE meta_actions SET status = 'approved', decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
  if (!claimed.length) throw new Error('This action is no longer pending.');
  const a = (await getAction(id))!;
  try {
    const result = await execute(a);
    await q(`UPDATE meta_actions SET status = 'executed', executed_at = now(), result = $2 WHERE id = $1`, [id, JSON.stringify(result)]);
    await reflectLocally(a);
    // A new campaign is created paused; switching it on (spending) is its own approval.
    if (a.kind === 'create_campaign' && result.campaign_id) {
      await propose({
        account_id: a.account_id,
        kind: 'activate',
        object_id: String(result.campaign_id),
        object_name: a.object_name,
        payload: { adset_ids: [result.adset_id].filter(Boolean), ad_ids: [result.ad_id].filter(Boolean) },
        summary: `Turn on "${a.object_name}" (starts spending ${((Number((a.payload as { daily_budget?: number }).daily_budget) || 0) / 100).toFixed(2)}/day)`,
        risk: 'spend',
        source: 'you',
        rationale: 'Created paused. Review the previews in Ads Manager, then approve to start delivery.',
      });
    }
  } catch (err) {
    await q(`UPDATE meta_actions SET status = 'failed', executed_at = now(), error = $2 WHERE id = $1`, [id, (err instanceof Error ? err.message : String(err)).slice(0, 1000)]);
  }
  return (await getAction(id))!;
}

/** Mirror an executed change in the synced copy, so pages and later proposals see it before the next sync. */
async function reflectLocally(a: MetaAction) {
  const p = a.payload as Record<string, unknown>;
  for (const table of ['meta_campaigns', 'meta_adsets', 'meta_ads']) {
    if (a.kind === 'pause' || a.kind === 'resume') await q(`UPDATE ${table} SET status = $2, effective_status = $2 WHERE id = $1`, [a.object_id, a.kind === 'pause' ? 'PAUSED' : 'ACTIVE']);
    if (a.kind === 'rename') await q(`UPDATE ${table} SET name = $2 WHERE id = $1`, [a.object_id, String(p.name)]);
  }
  if (a.kind === 'budget') {
    await q(`UPDATE meta_campaigns SET daily_budget = $2 WHERE id = $1`, [a.object_id, Number(p.daily_budget)]);
    await q(`UPDATE meta_adsets SET daily_budget = $2 WHERE id = $1`, [a.object_id, Number(p.daily_budget)]);
  }
}

/** Belongs-to check: the object must be in the action's ad account, which the token's connection owns. */
async function ownedBy(token: string, objectId: string, act: string): Promise<{ name: string; status: string; daily_budget: number | null; targeting?: Record<string, unknown> }> {
  const o = await graph<{ account_id: string; name: string; status: string; daily_budget?: string; targeting?: Record<string, unknown> }>(token, objectId, { params: { fields: 'account_id,name,status,daily_budget' } });
  if (`act_${o.account_id}` !== act) throw new Error('That object is not in this ad account.');
  return { name: o.name, status: o.status, daily_budget: o.daily_budget ? Number(o.daily_budget) : null };
}

async function execute(a: MetaAction): Promise<Record<string, unknown>> {
  const { token, account } = await accountToken(a.account_id);
  const p = a.payload as Record<string, any>;
  switch (a.kind) {
    case 'pause':
    case 'resume': {
      await ownedBy(token, a.object_id, account.id);
      await graph(token, a.object_id, { method: 'POST', params: { status: a.kind === 'pause' ? 'PAUSED' : 'ACTIVE' } });
      return { status: a.kind === 'pause' ? 'PAUSED' : 'ACTIVE' };
    }
    case 'budget': {
      const o = await ownedBy(token, a.object_id, account.id);
      const problem = checkBudgetChange(o.daily_budget, Number(p.daily_budget), 100);
      if (problem) throw new Error(problem);
      await graph(token, a.object_id, { method: 'POST', params: { daily_budget: Math.round(Number(p.daily_budget)) } });
      return { from: o.daily_budget, to: Math.round(Number(p.daily_budget)) };
    }
    case 'rename': {
      await ownedBy(token, a.object_id, account.id);
      await graph(token, a.object_id, { method: 'POST', params: { name: String(p.name).slice(0, 400) } });
      return { name: p.name };
    }
    case 'duplicate': {
      await ownedBy(token, a.object_id, account.id);
      // Campaign.create_copy (SDK v26): deep copy, everything paused, renamed.
      const r = await graph<{ copied_campaign_id?: string; ad_object_ids?: unknown }>(token, `${a.object_id}/copies`, {
        method: 'POST',
        params: { deep_copy: true, status_option: 'PAUSED', rename_options: { rename_suffix: ' - Copy' } },
      });
      return r as Record<string, unknown>;
    }
    case 'targeting': {
      await ownedBy(token, a.object_id, account.id);
      const current = await graph<{ targeting: Record<string, unknown> }>(token, a.object_id, { params: { fields: 'targeting' } });
      const merged = { ...current.targeting, ...(p.targeting as Record<string, unknown>) };
      await graph(token, a.object_id, { method: 'POST', params: { targeting: merged } });
      return { targeting: merged };
    }
    case 'activate': {
      // Turn on a created campaign and everything in it (each was created PAUSED).
      const ids = [...((p.ad_ids as string[]) ?? []), ...((p.adset_ids as string[]) ?? []), a.object_id];
      for (const id of ids) await ownedBy(token, id, account.id);
      for (const id of ids) await graph(token, id, { method: 'POST', params: { status: 'ACTIVE' } });
      return { activated: ids };
    }
    case 'create_campaign':
      return createFromPlan(token, account.id, p as CampaignPlan);
  }
}

// ── Campaign creation (everything PAUSED; activation is its own approval) ──

export type CampaignPlan = {
  name: string;
  objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'OUTCOME_SALES' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT';
  daily_budget: number; // minor units, campaign budget (Advantage campaign budget)
  special_ad_categories: string[];
  targeting: {
    geo_locations: { countries?: string[]; cities?: { key: string; radius?: number; distance_unit?: 'mile' | 'kilometer' }[]; regions?: { key: string }[]; zips?: { key: string }[] };
    age_min: number;
    age_max: number;
    genders?: number[];
    flexible_spec?: { interests: { id: string; name: string }[] }[];
    custom_audiences?: { id: string }[];
    excluded_custom_audiences?: { id: string }[];
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
  };
  advantage_placements: boolean;
  pixel_id?: string;
  page_id: string;
  instagram_actor_id?: string;
  creative: { link: string; message: string; headline: string; description?: string; cta: string; image_url?: string; image_base64?: string };
  start_time?: string;
};

const OPTIMIZATION: Record<CampaignPlan['objective'], { goal: string; event?: string }> = {
  OUTCOME_TRAFFIC: { goal: 'LINK_CLICKS' },
  OUTCOME_LEADS: { goal: 'OFFSITE_CONVERSIONS', event: 'LEAD' },
  OUTCOME_SALES: { goal: 'OFFSITE_CONVERSIONS', event: 'PURCHASE' },
  OUTCOME_AWARENESS: { goal: 'REACH' },
  OUTCOME_ENGAGEMENT: { goal: 'POST_ENGAGEMENT' },
};

export function planToTargeting(plan: CampaignPlan): Record<string, unknown> {
  const t: Record<string, unknown> = { ...plan.targeting };
  if (plan.advantage_placements) {
    delete t.publisher_platforms;
    delete t.facebook_positions;
    delete t.instagram_positions;
  }
  // Advantage+ audience off when detailed targeting is given, so it is respected as typed.
  t.targeting_automation = { advantage_audience: plan.targeting.flexible_spec?.length ? 0 : 1 };
  return t;
}

export function planToStorySpec(plan: CampaignPlan, imageHash?: string): Record<string, unknown> {
  return {
    page_id: plan.page_id,
    ...(plan.instagram_actor_id ? { instagram_actor_id: plan.instagram_actor_id } : {}),
    link_data: {
      link: plan.creative.link,
      message: plan.creative.message,
      name: plan.creative.headline,
      ...(plan.creative.description ? { description: plan.creative.description } : {}),
      ...(imageHash ? { image_hash: imageHash } : plan.creative.image_url ? { picture: plan.creative.image_url } : {}),
      call_to_action: { type: plan.creative.cta, value: { link: plan.creative.link } },
    },
  };
}

async function createFromPlan(token: string, act: string, plan: CampaignPlan): Promise<Record<string, unknown>> {
  const created: Record<string, string> = {};
  const opt = OPTIMIZATION[plan.objective];
  const campaign = await graph<{ id: string }>(token, `${act}/campaigns`, {
    method: 'POST',
    params: { name: plan.name, objective: plan.objective, status: 'PAUSED', special_ad_categories: plan.special_ad_categories, daily_budget: plan.daily_budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' },
  });
  created.campaign_id = campaign.id;
  try {
    const adset = await graph<{ id: string }>(token, `${act}/adsets`, {
      method: 'POST',
      params: {
        name: `${plan.name} - Ad set`,
        campaign_id: campaign.id,
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: opt.goal,
        targeting: planToTargeting(plan),
        ...(opt.event && plan.pixel_id ? { promoted_object: { pixel_id: plan.pixel_id, custom_event_type: opt.event } } : {}),
        ...(plan.start_time ? { start_time: plan.start_time } : {}),
      },
    });
    created.adset_id = adset.id;
    let imageHash: string | undefined;
    if (plan.creative.image_base64) {
      const up = await graph<{ images: Record<string, { hash: string }> }>(token, `${act}/adimages`, { method: 'POST', params: { bytes: plan.creative.image_base64 } });
      imageHash = Object.values(up.images)[0]?.hash;
    }
    const creative = await graph<{ id: string }>(token, `${act}/adcreatives`, { method: 'POST', params: { name: `${plan.name} - Creative`, object_story_spec: planToStorySpec(plan, imageHash) } });
    created.creative_id = creative.id;
    const ad = await graph<{ id: string }>(token, `${act}/ads`, { method: 'POST', params: { name: `${plan.name} - Ad`, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'PAUSED' } });
    created.ad_id = ad.id;
  } catch (err) {
    // Leave nothing half-built that could be switched on by mistake: the campaign stays PAUSED and its ids are reported.
    throw new Error(`${err instanceof Error ? err.message : String(err)} (created so far, all paused: ${JSON.stringify(created)})`);
  }
  return created;
}
