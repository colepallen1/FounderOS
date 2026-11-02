'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createTask, deleteTask, moveTask, updateTask } from '@/lib/actions';
import { PRIORITIES, TASK_COLUMNS, type Task, type TaskStatus } from '@/lib/types';
import { Icon } from './Icon';

type Opt = { id: string; name: string };

export function Kanban({ tasks, clients, today, fixedClient }: { tasks: Task[]; clients: Opt[]; today: string; fixedClient?: { id: string; slug: string } }) {
  const [items, setItems] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: TaskStatus; index: number } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(tasks), [tasks]);

  const byCol = (col: TaskStatus) => items.filter((t) => t.status === col).sort((a, b) => a.position - b.position);

  const drop = (col: TaskStatus, index: number) => {
    if (!dragId) return;
    const list = byCol(col).filter((t) => t.id !== dragId);
    const before = list[index - 1]?.position;
    const after = list[index]?.position;
    const position = before == null && after == null ? Date.now() : before == null ? after! - 1024 : after == null ? before + 1024 : (before + after) / 2;
    const id = dragId;
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: col, position } : t)));
    setDragId(null);
    setOver(null);
    start(() => moveTask(id, col, position));
  };

  return (
    <>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {TASK_COLUMNS.map((col) => {
          const list = byCol(col.id);
          return (
            <div
              key={col.id}
              className={`flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col border bg-surface/60 xl:w-auto xl:max-w-none ${over?.col === col.id ? 'border-accent/60' : 'border-line'}`}
              style={{ borderRadius: 'var(--radius)' }}
              onDragOver={(e) => {
                e.preventDefault();
                if (over?.col !== col.id) setOver({ col: col.id, index: list.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.id, over?.col === col.id ? over.index : list.length);
              }}
            >
              <div className="flex items-center justify-between border-b border-line/70 px-3.5 py-3">
                <span className="eyebrow">{col.label}</span>
                <span className="num text-[13px] text-faint">{list.length}</span>
              </div>
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2.5">
                {list.map((t, i) => (
                  <div
                    key={t.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const idx = e.clientY < r.top + r.height / 2 ? i : i + 1;
                      if (over?.col !== col.id || over.index !== idx) setOver({ col: col.id, index: idx });
                    }}
                  >
                    {over?.col === col.id && over.index === i && dragId && dragId !== t.id && <DropLine />}
                    <Card task={t} today={today} showClient={!fixedClient} dragging={dragId === t.id} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onOpen={() => setEditing(t)} />
                    {over?.col === col.id && over.index === list.length && i === list.length - 1 && dragId && <DropLine />}
                  </div>
                ))}
                <QuickAdd status={col.id} clientId={fixedClient?.id} clientSlug={fixedClient?.slug} />
              </div>
            </div>
          );
        })}
      </div>
      {editing && <EditDialog task={editing} clients={clients} fixedClient={fixedClient} onClose={() => setEditing(null)} />}
    </>
  );
}

function DropLine() {
  return <div className="mb-2 h-0.5 bg-accent" />;
}

function Card({ task: t, today, showClient, dragging, onDragStart, onDragEnd, onOpen }: { task: Task; today: string; showClient: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void }) {
  const late = t.status !== 'done' && t.due_date && t.due_date < today;
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group w-full cursor-grab border border-line bg-raised p-3 text-left transition hover:border-accent/50 active:cursor-grabbing ${dragging ? 'opacity-40' : ''} ${t.priority === 1 ? 'border-l-2 border-l-warn' : ''}`}
      style={{ borderRadius: 'var(--radius)' }}
    >
      <div className={`text-[13.5px] leading-snug ${t.status === 'done' ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-faint">
        {showClient && <span className="truncate">{t.client_name ?? 'Internal'}</span>}
        {t.due_date && (
          <span className={`inline-flex items-center gap-1 ${late ? 'text-bad' : ''}`}>
            <Icon name="clock" size={11} />
            {new Date(`${t.due_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </span>
        )}
        {t.recurring_id && <Icon name="repeat" size={11} />}
        {t.notes && <Icon name="note" size={11} />}
      </div>
    </button>
  );
}

function QuickAdd({ status, clientId, clientSlug }: { status: TaskStatus; clientId?: string; clientSlug?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-1.5 py-1.5 text-[11.5px] uppercase tracking-[0.12em] text-faint hover:text-accent-hi">
        <Icon name="plus" size={13} /> Add
      </button>
    );
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await createTask(fd);
        ref.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="status" value={status} />
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      {clientSlug && <input type="hidden" name="client_slug" value={clientSlug} />}
      <input name="title" autoFocus required placeholder="What needs doing?" className="field py-2 text-[13px]" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <div className="flex gap-2">
        <button className="btn px-2.5 py-1.5">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2.5 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditDialog({ task, clients, fixedClient, onClose }: { task: Task | null; clients: Opt[]; fixedClient?: { id: string; slug: string }; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [, start] = useTransition();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const isNew = !task;
  return (
    <dialog ref={ref} onClose={onClose} className="panel w-[calc(100vw-2rem)] max-w-lg bg-surface p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <form
        action={async (fd) => {
          await (isNew ? createTask(fd) : updateTask(fd));
          ref.current?.close();
        }}
        className="space-y-4 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">{isNew ? 'New task' : 'Edit task'}</div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="text-faint hover:text-ink">
            <Icon name="x" size={16} />
          </button>
        </div>
        {task && <input type="hidden" name="id" value={task.id} />}
        {fixedClient && <input type="hidden" name="client_slug" value={fixedClient.slug} />}
        <input name="title" required defaultValue={task?.title} placeholder="Task" className="field text-[15px]" autoFocus />
        <textarea name="notes" defaultValue={task?.notes} rows={4} placeholder="Notes, links, context" className="field resize-y text-[13.5px]" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Column</label>
            <select name="status" defaultValue={task?.status ?? 'week'} className="field">
              {TASK_COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select name="priority" defaultValue={task?.priority ?? 2} className="field">
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due</label>
            <input type="date" name="due_date" defaultValue={task?.due_date ?? ''} className="field" />
          </div>
          <div>
            <label className="label">Client</label>
            {fixedClient ? (
              <input type="hidden" name="client_id" value={fixedClient.id} />
            ) : null}
            <select name={fixedClient ? 'client_id_display' : 'client_id'} defaultValue={fixedClient?.id ?? task?.client_id ?? ''} disabled={Boolean(fixedClient)} className="field">
              <option value="">Internal</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {task?.client_slug && !fixedClient && (
          <Link href={`/clients/${task.client_slug}`} className="link inline-flex items-center gap-1 text-[12px]">
            Open {task.client_name} <Icon name="arrowRight" size={12} />
          </Link>
        )}
        <div className="flex items-center justify-between pt-2">
          <button className="btn">{isNew ? 'Create' : 'Save'}</button>
          {task && (
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await deleteTask(task.id);
                  ref.current?.close();
                })
              }
              className="btn-danger"
            >
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
