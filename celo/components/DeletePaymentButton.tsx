'use client';

import { useTransition } from 'react';
import { deleteManualPayment } from '@/lib/actions';
import { Icon } from './Icon';

export function DeletePaymentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => confirm('Delete this logged payment?') && start(() => deleteManualPayment(id))} className="text-faint hover:text-bad" aria-label="Delete payment">
      <Icon name="trash" size={13} />
    </button>
  );
}
