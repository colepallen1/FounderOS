'use client';

import { useState, useTransition } from 'react';
import { runClaude } from '@/lib/meta/ui-actions';
import type { AnalysisT } from '@/lib/ai/ads-analyst';
import { Badge } from '../ui';
import { Icon } from '../Icon';

const STATUS = { on_track: { label: 'On track', tone: 'good' }, watch: { label: 'Watch', tone: 'warn' }, off_track: { label: 'Off track', tone: 'bad' } } as const;

export function ClaudePanel({ accountId, report, configured }: { accountId: string; report: { kind: string; created_at: string; period_start: string; period_end: string; content: AnalysisT } | null; configured: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (kind: 'daily' | 'weekly' | 'analysis') =>
    start(async () => {
      setMsg(null);
      const r = await runClaude(accountId, kind);
      setMsg(r.ok ? `Done.${r.data?.proposals ? ` ${r.data.proposals} change${r.data.proposals === 1 ? '' : 's'} proposed for approval.` : ''}` : r.error);
    });
  const c = report?.content;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(['daily', 'weekly', 'analysis'] as const).map((k) => (
          <button key={k} onClick={() => run(k)} disabled={pending || !configured} className={k === 'analysis' ? 'btn px-2.5 py-1.5' : 'btn-ghost px-2.5 py-1.5'}>
            {k === 'daily' ? 'Daily briefing' : k === 'weekly' ? 'Weekly summary' : 'Deep analysis'}
          </button>
        ))}
        {pending && <span className="text-[12px] text-muted">Claude is reading the account. This can take a minute.</span>}
        {msg && !pending && <span className={`text-[12px] ${msg.startsWith('Done') ? 'text-good' : 'text-bad'}`}>{msg}</span>}
      </div>
      {!configured && <p className="mt-3 text-[12.5px] text-muted">Add an Anthropic API key under Integrations to turn on Claude analysis.</p>}
      {c ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
            <span className="text-[11.5px] text-faint">
              {report!.kind} · {report!.period_start} to {report!.period_end} · generated {new Date(report!.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <div className="display text-[20px] leading-snug text-ink">{c.headline}</div>
          <p className="text-[14px] leading-relaxed text-muted">{c.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <List title="Winning" items={c.winners.map((w) => ({ head: w.name, body: w.why }))} />
            <List title="Losing" items={c.losers.map((w) => ({ head: w.name, body: w.why }))} />
          </div>
          {c.fatigue.length > 0 && <List title="Creative fatigue" items={c.fatigue.map((f) => ({ head: f.name, body: f.assessment }))} />}
          {c.recommendations.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Recommendations</div>
              <ul className="space-y-2">
                {c.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px]">
                    <Icon name="arrowRight" size={13} className="mt-1 shrink-0 text-accent" />
                    <span>
                      <span className="text-ink">{r.object_name}:</span> <span className="text-muted">{r.rationale}</span> <span className="text-faint">({r.confidence} confidence)</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-faint">Pauses and budget changes Claude recommends are added to the approval queue. Nothing runs without you.</p>
            </div>
          )}
          {c.watch_next.length > 0 && <List title="Watch next" items={c.watch_next.map((w) => ({ head: '', body: w }))} />}
        </div>
      ) : (
        configured && <p className="mt-4 text-[13px] text-faint">No analysis yet for this account.</p>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: { head: string; body: string }[] }) {
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((x, i) => (
            <li key={i} className="text-[13px] leading-relaxed">
              {x.head && <span className="text-ink">{x.head}: </span>}
              <span className="text-muted">{x.body}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-faint">None identified.</p>
      )}
    </div>
  );
}
