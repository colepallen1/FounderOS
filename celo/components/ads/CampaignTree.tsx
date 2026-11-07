'use client';

import { useState, useTransition } from 'react';
import { approveChange, requestChange } from '@/lib/meta/ui-actions';
import type { ActionKind } from '@/lib/meta/actions';
import { Icon } from '../Icon';
import { cur, num, pct } from './fmt';

export type Metrics = { spend: number; results: number; cpa: number | null; roas: number | null; ctr: number | null; impressions: number };
export type TreeNode = { id: string; name: string; status: string; effective_status: string; daily_budget: number | null; lifetime_budget: number | null; m: Metrics; level: 'campaign' | 'adset' | 'ad'; children?: TreeNode[]; objective?: string };

type Review = { summary: string; risk: 'spend' | 'material'; id: string };

export function CampaignTree({ accountId, currency, nodes }: { accountId: string; currency: string; nodes: TreeNode[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showOff, setShowOff] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const list = nodes.filter((n) => showOff || n.status === 'ACTIVE' || n.m.spend > 0);
  const hidden = nodes.length - list.length;
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rows: { n: TreeNode; depth: number }[] = [];
  for (const c of list) {
    rows.push({ n: c, depth: 0 });
    if (open.has(c.id)) for (const s of c.children ?? []) {
      rows.push({ n: s, depth: 1 });
      if (open.has(s.id)) for (const a of s.children ?? []) rows.push({ n: a, depth: 2 });
    }
  }
  return (
    <>
      {hidden > 0 && (
        <div className="px-5 pb-2 text-right text-[12px]">
          <button onClick={() => setShowOff((v) => !v)} className="link">{showOff ? 'Hide paused without spend' : `Show ${hidden} paused`}</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Budget / day</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Results</th>
              <th className="text-right">Per result</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">CTR</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, depth }) => (
              <NodeRow key={n.id} n={n} depth={depth} accountId={accountId} currency={currency} open={open.has(n.id)} onToggle={() => toggle(n.id)} onReview={setReview} />
            ))}
          </tbody>
        </table>
      </div>
      {review && <ReviewDialog review={review} onClose={() => setReview(null)} />}
    </>
  );
}

function NodeRow({ n, depth, accountId, currency, open, onToggle, onReview }: { n: TreeNode; depth: number; accountId: string; currency: string; open: boolean; onToggle: () => void; onReview: (r: Review) => void }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState(n.daily_budget != null ? (n.daily_budget / 100).toString() : '');
  const [error, setError] = useState<string | null>(null);
  const running = n.status === 'ACTIVE';

  const ask = (kind: ActionKind, summary: string, payload?: Record<string, unknown>) => {
    setError(null);
    start(async () => {
      const r = await requestChange({ account_id: accountId, kind, object_id: n.id, object_name: n.name, payload, summary, from_budget: n.daily_budget });
      if (!r.ok) return setError(r.error);
      setEditing(false);
      onReview({ id: r.data!, summary, risk: kind === 'resume' || (kind === 'budget' && Number(payload?.daily_budget) > (n.daily_budget ?? 0)) ? 'spend' : 'material' });
    });
  };

  return (
    <>
      <tr className={pending ? 'opacity-50' : ''}>
        <td>
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
            {n.children?.length ? (
              <button onClick={onToggle} className="text-faint hover:text-ink" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
                <Icon name={open ? 'arrowDown' : 'arrowRight'} size={13} />
              </button>
            ) : (
              <span className="w-[13px]" />
            )}
            <span className={`max-w-[320px] truncate ${depth === 0 ? 'text-[14px] text-ink' : 'text-[13px] text-muted'}`} title={n.name}>
              {n.name}
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-faint">{n.level === 'adset' ? 'ad set' : n.level}</span>
          </div>
        </td>
        <td>
          <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] ${running && n.effective_status === 'ACTIVE' ? 'text-good' : /ISSUE|DISAPPROVED/.test(n.effective_status) ? 'text-bad' : 'text-muted'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${running && n.effective_status === 'ACTIVE' ? 'bg-good' : 'bg-faint'}`} />
            {running && n.effective_status === 'ACTIVE' ? 'Running' : (running ? n.effective_status : n.status).replace(/_/g, ' ').toLowerCase()}
          </span>
        </td>
        <td className="whitespace-nowrap">
          {editing ? (
            <span className="flex items-center gap-1.5">
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="field w-24 py-1 text-[13px]" autoFocus aria-label="New daily budget" />
              <button onClick={() => ask('budget', `Change "${n.name}" daily budget ${cur((n.daily_budget ?? 0) / 100, currency)} → ${cur(Number(budget), currency)}`, { daily_budget: Math.round(Number(budget) * 100), from: n.daily_budget })} className="btn px-2 py-1 text-[10.5px]">
                Review
              </button>
              <button onClick={() => setEditing(false)} className="text-faint hover:text-ink" aria-label="Cancel">
                <Icon name="x" size={13} />
              </button>
            </span>
          ) : n.daily_budget != null ? (
            <button onClick={() => setEditing(true)} className="num group inline-flex items-center gap-1.5 text-[14px] hover:text-accent-hi" title="Change daily budget">
              {cur(n.daily_budget / 100, currency)} <span className="text-[10px] uppercase tracking-[0.12em] text-faint group-hover:text-accent">edit</span>
            </button>
          ) : n.lifetime_budget != null ? (
            <span className="text-[12px] text-faint">{cur(n.lifetime_budget / 100, currency)} lifetime</span>
          ) : (
            <span className="text-[12px] text-faint">-</span>
          )}
        </td>
        <td className="num text-right text-[14px]">{n.m.spend ? cur(n.m.spend, currency) : <span className="text-faint">-</span>}</td>
        <td className="num text-right text-[14px]">{n.m.results ? num(n.m.results, 1) : <span className="text-faint">-</span>}</td>
        <td className="num text-right text-[14px]">{cur(n.m.cpa, currency)}</td>
        <td className="num text-right text-[14px]">{n.m.roas == null ? '-' : `${n.m.roas.toFixed(2)}x`}</td>
        <td className="num text-right text-[14px]">{pct(n.m.ctr)}</td>
        <td className="whitespace-nowrap text-right">
          <span className="inline-flex gap-1.5">
            {(n.status === 'ACTIVE' || n.status === 'PAUSED') && (
              <button onClick={() => ask(running ? 'pause' : 'resume', `${running ? 'Pause' : 'Turn on'} "${n.name}"`)} disabled={pending} className="btn-ghost px-2 py-1 text-[10.5px]">
                {running ? 'Pause' : 'Turn on'}
              </button>
            )}
            {n.level === 'campaign' && (
              <button onClick={() => ask('duplicate', `Duplicate "${n.name}" (copy created paused)`)} disabled={pending} className="btn-ghost px-2 py-1 text-[10.5px]" title="Duplicate campaign">
                Duplicate
              </button>
            )}
            <button
              onClick={() => {
                const name = prompt('New name', n.name);
                if (name && name !== n.name) ask('rename', `Rename "${n.name}" → "${name}"`, { name });
              }}
              disabled={pending}
              className="btn-ghost px-2 py-1 text-[10.5px]"
            >
              Rename
            </button>
          </span>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={9} className="pt-0 text-[12.5px] text-bad">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

/** The review step: what will change, whether it spends, approve now or leave it in the queue. */
function ReviewDialog({ review, onClose }: { review: Review; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="panel w-full max-w-md bg-surface p-6">
        <div className="eyebrow">Review change</div>
        <p className="mt-3 text-[15px] text-ink">{review.summary}</p>
        <p className={`mt-2 text-[12.5px] ${review.risk === 'spend' ? 'text-warn' : 'text-muted'}`}>
          {review.risk === 'spend' ? 'This can increase spend in Meta.' : 'This changes the live campaign in Meta.'} It is recorded in the approval log either way.
        </p>
        {result && <p className={`mt-3 text-[13px] ${result.startsWith('Done') ? 'text-good' : 'text-bad'}`}>{result}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {!result?.startsWith('Done') && (
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await approveChange(review.id);
                  setResult(r.ok ? 'Done. Meta has the change.' : r.error);
                })
              }
              className="btn"
            >
              <Icon name="check" size={13} /> {pending ? 'Running' : 'Approve and run'}
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">
            {result ? 'Close' : 'Leave in queue'}
          </button>
        </div>
      </div>
    </div>
  );
}
