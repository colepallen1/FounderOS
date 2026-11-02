import Link from 'next/link';
import { Kanban } from '@/components/Kanban';
import { NewTaskButton } from '@/components/NewTaskButton';
import { RecurringManager } from '@/components/Recurring';
import { PageHeader, Panel } from '@/components/ui';
import { clientOptions, listRecurring, listTasks, todayInTz } from '@/lib/queries';
import { materializeRecurring } from '@/lib/sync';

export const metadata = { title: 'Work' };
export const dynamic = 'force-dynamic';

export default async function Work({ searchParams }: { searchParams: { client?: string; new?: string } }) {
  await materializeRecurring(todayInTz());
  const [all, clients, rules] = await Promise.all([listTasks(), clientOptions(), listRecurring()]);
  const filter = searchParams.client;
  const tasks = filter === 'internal' ? all.filter((t) => !t.client_id) : filter ? all.filter((t) => t.client_id === filter) : all;
  const open = all.filter((t) => t.status !== 'done').length;
  const chips = [{ id: '', name: 'All' }, ...clients, { id: 'internal', name: 'Internal' }];
  return (
    <>
      <PageHeader eyebrow={`${open} open across ${clients.length} clients`} title="Work">
        <NewTaskButton clients={clients} autoOpen={searchParams.new === '1'} />
      </PageHeader>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => {
          const on = (filter ?? '') === c.id;
          return (
            <Link
              key={c.id || 'all'}
              href={c.id ? `/work?client=${c.id}` : '/work'}
              className={`whitespace-nowrap border px-3 py-1.5 text-[11.5px] uppercase tracking-[0.12em] transition-colors ${on ? 'border-accent/70 bg-accent/10 text-accent-hi' : 'border-line text-muted hover:text-ink'}`}
              style={{ borderRadius: 'var(--radius)' }}
            >
              {c.name}
            </Link>
          );
        })}
      </div>
      <Kanban tasks={tasks} clients={clients} today={todayInTz()} />
      <Panel title="Recurring" icon="repeat" className="mt-6">
        <RecurringManager rules={rules} clients={clients} />
      </Panel>
    </>
  );
}
