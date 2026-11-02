'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EditDialog } from './Kanban';
import { Icon } from './Icon';

export function NewTaskButton({ clients, autoOpen, fixedClient }: { clients: { id: string; name: string }[]; autoOpen?: boolean; fixedClient?: { id: string; slug: string } }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const close = () => {
    setOpen(false);
    if (params.has('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn">
        <Icon name="plus" size={14} /> Task
      </button>
      {open && <EditDialog task={null} clients={clients} fixedClient={fixedClient} onClose={close} />}
    </>
  );
}
