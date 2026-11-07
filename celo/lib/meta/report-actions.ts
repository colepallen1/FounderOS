'use server';

import { one } from '../db';
import { shareToken } from './report';

export async function createShareLink(slug: string): Promise<string> {
  const c = await one<{ id: string }>(`SELECT id FROM clients WHERE slug = $1`, [slug]);
  if (!c) throw new Error('Unknown client');
  return shareToken(c.id);
}
