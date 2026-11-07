'use server';

import { revalidatePath } from 'next/cache';
import { q } from '../db';
import { addConnection, checkConnection, discoverAccounts, getAccount, removeConnection, setAccountClient, setAccountTargets } from './connections';
import { syncAccount } from './sync';
import { runRules } from './rules';
import { approveAndExecute, propose, reject, type ActionKind, type CampaignPlan, planToStorySpec } from './actions';
import { draftPreview, adPreview, PREVIEW_FORMATS, searchGeo, searchInterests, pages, pixels, audiences } from './lookup';
import { analyze } from '../ai/ads-analyst';
import { checkBudgetChange } from '../integrations/meta-parse';

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : String(err) });
const done = () => revalidatePath('/', 'layout');

export async function addMetaConnection(form: FormData): Promise<Result<{ status: string; accounts: number }>> {
  const token = String(form.get('token') ?? '').trim();
  if (!token) return { ok: false, error: 'Paste the system-user access token.' };
  try {
    const r = await addConnection(String(form.get('label') ?? ''), token);
    done();
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

export async function recheckMetaConnection(id: string): Promise<Result> {
  try {
    await checkConnection(id);
    await discoverAccounts(id);
    done();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMetaConnection(id: string) {
  await removeConnection(id);
  done();
}

export async function linkAdAccount(accountId: string, clientId: string): Promise<void> {
  await setAccountClient(accountId, clientId || null);
  done();
}

export async function saveAccountTargets(form: FormData) {
  const num = (k: string) => {
    const v = String(form.get(k) ?? '').replace(/[$,\s]/g, '');
    return v === '' || Number.isNaN(Number(v)) ? null : Number(v);
  };
  const cpa = num('target_cpa');
  await setAccountTargets(String(form.get('account_id')), {
    result_event: String(form.get('result_event') ?? ''),
    target_cpa_cents: cpa == null ? null : Math.round(cpa * 100),
    target_roas: num('target_roas'),
    frequency_ceiling: num('frequency_ceiling'),
  });
  done();
}

export async function syncMetaAccount(accountId: string): Promise<Result<string>> {
  try {
    const a = await getAccount(accountId);
    if (!a) throw new Error('Unknown ad account.');
    const msg = await syncAccount(a);
    done();
    return { ok: true, data: msg };
  } catch (err) {
    return fail(err);
  }
}

export async function rerunRules(accountId: string): Promise<Result> {
  try {
    const a = await getAccount(accountId);
    if (a) await runRules(a);
    done();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const RISK: Record<string, 'spend' | 'material'> = { pause: 'material', resume: 'spend', duplicate: 'material', rename: 'material', targeting: 'material', activate: 'spend' };

/** A change you asked for: recorded as a proposal, shown for review, run only on approval. */
export async function requestChange(input: { account_id: string; kind: ActionKind; object_id: string; object_name: string; payload?: Record<string, unknown>; summary: string; from_budget?: number | null }): Promise<Result<string>> {
  try {
    let risk = RISK[input.kind] ?? 'material';
    if (input.kind === 'budget') {
      const next = Number(input.payload?.daily_budget);
      const problem = checkBudgetChange(input.from_budget ?? null, next, 100);
      if (problem) return { ok: false, error: problem };
      risk = next > (input.from_budget ?? 0) ? 'spend' : 'material';
    }
    const id = await propose({ ...input, risk, source: 'you' });
    if (!id) return { ok: false, error: 'There is already a pending change of this kind for it. Approve or reject that one first.' };
    done();
    return { ok: true, data: id };
  } catch (err) {
    return fail(err);
  }
}

export async function approveChange(id: string): Promise<Result<{ status: string; error: string }>> {
  try {
    const a = await approveAndExecute(id);
    done();
    return a.status === 'executed' ? { ok: true, data: { status: a.status, error: '' } } : { ok: false, error: a.error || `Action ${a.status}` };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectChange(id: string) {
  await reject(id);
  done();
}

export async function dismissAlert(id: string) {
  await q(`UPDATE meta_alerts SET status = 'dismissed' WHERE id = $1`, [id]);
  done();
}

export async function runClaude(accountId: string, kind: 'daily' | 'weekly' | 'analysis'): Promise<Result<{ proposals: number }>> {
  try {
    const a = await getAccount(accountId);
    if (!a) throw new Error('Unknown ad account.');
    const r = await analyze(a, kind);
    done();
    return { ok: true, data: { proposals: r.proposals } };
  } catch (err) {
    return fail(err);
  }
}

export async function previewAd(accountId: string, adId: string, format: string): Promise<Result<string | null>> {
  try {
    return { ok: true, data: await adPreview(accountId, adId, format) };
  } catch (err) {
    return fail(err);
  }
}

export async function previewDraft(accountId: string, plan: CampaignPlan): Promise<Result<{ format: string; label: string; src: string | null }[]>> {
  try {
    const spec = planToStorySpec(plan);
    const out = [];
    for (const f of PREVIEW_FORMATS.slice(0, 3)) out.push({ format: f.id, label: f.label, src: await draftPreview(accountId, spec, f.id) });
    return { ok: true, data: out };
  } catch (err) {
    return fail(err);
  }
}

export async function builderLookups(accountId: string): Promise<Result<{ pages: { id: string; name: string }[]; pixels: { id: string; name: string }[]; audiences: { id: string; name: string }[] }>> {
  try {
    const [p, x, a] = await Promise.all([pages(accountId), pixels(accountId).catch(() => []), audiences(accountId).catch(() => [])]);
    return { ok: true, data: { pages: p, pixels: x, audiences: a.map((v) => ({ id: v.id, name: v.name })) } };
  } catch (err) {
    return fail(err);
  }
}

export async function findGeo(accountId: string, query: string) {
  try {
    return { ok: true as const, data: await searchGeo(accountId, query) };
  } catch (err) {
    return fail(err);
  }
}

export async function findInterests(accountId: string, query: string) {
  try {
    return { ok: true as const, data: await searchInterests(accountId, query) };
  } catch (err) {
    return fail(err);
  }
}

export async function submitPlan(accountId: string, plan: CampaignPlan): Promise<Result<string>> {
  if (!plan.name || !plan.page_id || !plan.creative.link || !plan.creative.message || !plan.creative.headline) return { ok: false, error: 'Name, Page, link, primary text and headline are required.' };
  if (plan.daily_budget < 100) return { ok: false, error: 'Daily budget must be at least 1.00.' };
  if ((plan.objective === 'OUTCOME_LEADS' || plan.objective === 'OUTCOME_SALES') && !plan.pixel_id) return { ok: false, error: 'Leads and Sales campaigns need a pixel to optimise for.' };
  const id = await propose({ account_id: accountId, kind: 'create_campaign', object_name: plan.name, payload: plan as unknown as Record<string, unknown>, summary: `Create campaign "${plan.name}" (${plan.objective.replace('OUTCOME_', '').toLowerCase()}, ${(plan.daily_budget / 100).toFixed(2)}/day), all paused`, risk: 'material', source: 'you' });
  done();
  return id ? { ok: true, data: id } : { ok: false, error: 'Could not queue the campaign.' };
}
