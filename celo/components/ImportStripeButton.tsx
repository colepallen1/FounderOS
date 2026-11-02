'use client';

import { useTransition } from 'react';
import { importStripeClients } from '@/lib/actions';
import { Icon } from './Icon';

export function ImportStripeButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => void (await importStripeClients()))} className="btn" title="Create a linked client for every paying Stripe customer not on a client yet">
      <Icon name="money" size={14} /> {pending ? 'Importing' : `Import ${count} from Stripe`}
    </button>
  );
}
