'use client';

import { useState, useTransition } from 'react';
import { createObjective, deleteObjective, setObjectiveProgress } from '@/lib/actions';
import type { Objective } from '@/lib/types';
import { Icon } from './Icon';

export function Objectives({ items, clientId, clientSlug }: { items: Objective[]; clientId: string; clientSlug: string }) {
  const [adding, setAdding] = useState(items.length === 0);
  return (
    <div className="space-y-5">
      {items.map((o) => (
        <ObjectiveRow key={o.id} o={o} />
      ))}
      {adding ? (
        <form action={createObjective} className="grid gap-3 border-t border-line/60 pt-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="client_slug" value={clientSlug} />
          <div>
            <label className="label">Objective</label>
            <input name="title" required placeholder="Scale lead volume" className="field" />
          </div>
          <div>
            <label className="label">Target</label>
            <input name="target" placeholder="120 leads/mo at under $40 CPL" className="field" />
          </div>
          <div>
            <label className="label">By</label>
            <input name="due_date" type="date" className="field" />
          </div>
          <button className="btn justify-center">Add</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.12em] text-faint hover:text-accent-hi">
          <Icon name="plus" size={13} /> Objective
        </button>
      )}
    </div>
  );
}

function ObjectiveRow({ o }: { o: Objective }) {
  const [value, setValue] = useState(o.progress);
  const [, start] = useTransition();
  const done = value >= 100;
  return (
    <div className="group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14.5px]">{o.title}</div>
          <div className="text-[11.5px] text-faint">
            {o.target}
            {o.target && o.due_date && ' · '}
            {o.due_date && `by ${new Date(`${o.due_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`num text-[20px] ${done ? 'text-good' : 'text-accent-hi'}`}>{value}%</span>
          <button onClick={() => confirm('Delete this objective?') && start(() => deleteObjective(o.id))} className="text-faint opacity-0 hover:text-bad group-hover:opacity-100" aria-label="Delete objective">
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <div className="relative mt-2 h-1.5 bg-line/70" style={{ borderRadius: 'var(--radius)' }}>
        <div className={`absolute inset-y-0 left-0 ${done ? 'bg-good' : 'bg-accent'}`} style={{ width: `${value}%`, borderRadius: 'var(--radius)' }} />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          aria-label={`Progress for ${o.title}`}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={() => start(() => setObjectiveProgress(o.id, value))}
          onKeyUp={() => start(() => setObjectiveProgress(o.id, value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
