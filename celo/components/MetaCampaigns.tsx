'use client';

import { useState, useTransition } from 'react';
import { metaSetBudget, metaSetStatus } from '@/lib/actions';
import type { MetaAccount, MetaNode } from '@/lib/integrations/meta-manage';
import { Icon } from './Icon';

const money = (minor: number | null, unit: number, cur: string) =>
  minor == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: unit === 1 ? 0 : 2 }).format(minor / unit);

function StatusPill({ s }: { s: string }) {
  const on = s === 'ACTIVE';
  const label = s.replace(/_/g, ' ').toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] ${on ? 'text-good' : s.includes('ISSUE') || s.includes('DISAPPROVED') ? 'text-bad' : 'text-muted'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-good' : 'bg-faint'}`} />
      {on ? 'Running' : label}
    </span>
  );
}

function Row({ n, clientId, acct, level, toggle }: { n: MetaNode; clientId: string; acct: MetaAccount; level: 'campaign' | 'adset'; toggle?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(n.daily_budget != null ? String(n.daily_budget / acct.unit) : '');
  const [error, setError] = useState<string | null>(null);
  const cur = acct.currency;
  const fmt = (m: number | null) => money(m, acct.unit, cur);
  const running = n.status === 'ACTIVE';

  const flip = () => {
    const next = running ? 'PAUSED' : 'ACTIVE';
    if (!confirm(`${running ? 'Pause' : 'Turn on'} "${n.name}"? This changes the live ${level === 'campaign' ? 'campaign' : 'ad set'} in Meta.`)) return;
    setError(null);
    start(async () => {
      const r = await metaSetStatus(clientId, n.id, next);
      if (!r.ok) setError(r.error);
    });
  };
  const save = () => {
    const newMinor = Math.round(Number(value.replace(/[$,\s]/g, '')) * acct.unit);
    if (!confirm(`Change the daily budget of "${n.name}" from ${fmt(n.daily_budget)} to ${fmt(newMinor)}? Meta starts spending at the new rate right away.`)) return;
    setError(null);
    start(async () => {
      const r = await metaSetBudget(clientId, n.id, value, n.daily_budget, acct.unit);
      if (r.ok) setEditing(false);
      else setError(r.error);
    });
  };

  return (
    <>
      <tr className={pending ? 'opacity-50' : ''}>
        <td className={level === 'adset' ? 'pl-9' : ''}>
          <div className="flex items-center gap-2">
            {toggle}
            <span className={`truncate ${level === 'campaign' ? 'text-[14px] text-ink' : 'text-[13px] text-muted'}`} title={n.name}>
              {n.name}
            </span>
          </div>
        </td>
        <td>
          <StatusPill s={n.status === 'ACTIVE' ? n.effective_status : n.status} />
        </td>
        <td className="whitespace-nowrap">
          {editing ? (
            <span className="flex items-center gap-1.5">
              <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="field w-24 py-1 text-[13px]" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
              <button onClick={save} className="btn px-2 py-1 text-[10.5px]">Save</button>
              <button onClick={() => setEditing(false)} className="text-faint hover:text-ink" aria-label="Cancel">
                <Icon name="x" size={13} />
              </button>
            </span>
          ) : n.daily_budget != null ? (
            <button onClick={() => setEditing(true)} className="num group inline-flex items-center gap-1.5 text-[15px] hover:text-accent-hi" title="Edit daily budget">
              {fmt(n.daily_budget)}
              <span className="text-[10px] uppercase tracking-[0.12em] text-faint group-hover:text-accent">edit</span>
            </button>
          ) : n.lifetime_budget != null ? (
            <span className="text-[12px] text-faint">{fmt(n.lifetime_budget)} lifetime</span>
          ) : (
            <span className="text-[12px] text-faint">{level === 'campaign' ? 'set per ad set' : 'campaign budget'}</span>
          )}
        </td>
        <td className="num text-right text-[14px]">{fmt(n.perf.spend_cents * (acct.unit / 100))}</td>
        <td className="num text-right text-[14px]">{n.perf.results ? n.perf.results.toLocaleString('en-US', { maximumFractionDigits: 1 }) : <span className="text-faint">-</span>}</td>
        <td className="num text-right text-[14px]">{n.perf.cost_per_result_cents != null ? fmt(n.perf.cost_per_result_cents * (acct.unit / 100)) : <span className="text-faint">-</span>}</td>
        <td className="text-right">
          {(n.status === 'ACTIVE' || n.status === 'PAUSED') && (
            <button onClick={flip} disabled={pending} className={running ? 'btn-ghost px-2.5 py-1 text-[10.5px]' : 'btn px-2.5 py-1 text-[10.5px]'}>
              {running ? 'Pause' : 'Turn on'}
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="pt-0 text-[12.5px] text-bad">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

export function MetaCampaigns({ acct, clientId }: { acct: MetaAccount; clientId: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showOff, setShowOff] = useState(false);
  const list = acct.campaigns.filter((c) => showOff || c.status === 'ACTIVE');
  const hidden = acct.campaigns.length - acct.campaigns.filter((c) => c.status === 'ACTIVE').length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 text-[12px] text-faint">
        <span>
          {acct.name} · {acct.id} · spend and results are the last 7 days
        </span>
        {hidden > 0 && (
          <button onClick={() => setShowOff((v) => !v)} className="link">
            {showOff ? 'Hide paused' : `Show ${hidden} paused`}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-faint">No {showOff ? '' : 'running '}campaigns in this account.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Campaign / ad set</th>
                <th>Status</th>
                <th>Daily budget</th>
                <th className="text-right">Spend 7d</th>
                <th className="text-right">Results</th>
                <th className="text-right">Per result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const isOpen = open.has(c.id);
                const toggle =
                  c.adsets.length > 0 ? (
                    <button
                      onClick={() => setOpen((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                      className="text-faint hover:text-ink"
                      aria-label={isOpen ? 'Hide ad sets' : 'Show ad sets'}
                      aria-expanded={isOpen}
                    >
                      <Icon name={isOpen ? 'arrowDown' : 'arrowRight'} size={13} />
                    </button>
                  ) : (
                    <span className="w-[13px]" />
                  );
                return [
                  <Row key={c.id} n={c} clientId={clientId} acct={acct} level="campaign" toggle={toggle} />,
                  ...(isOpen ? c.adsets.map((a) => <Row key={a.id} n={a} clientId={clientId} acct={acct} level="adset" />) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
