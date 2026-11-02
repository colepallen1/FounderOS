import 'server-only';
import path from 'node:path';
import { SCHEMA } from './schema';

/**
 * One query function for two engines:
 *  - DATABASE_URL set (Vercel + Neon, or any Postgres) -> `postgres` driver.
 *  - unset (local dev) -> PGlite, a real Postgres compiled to WASM, stored in .data/.
 * Both speak the same SQL, so nothing above this file knows which one is live.
 */
type Row = Record<string, unknown>;
type Engine = { query: (text: string, params: unknown[]) => Promise<Row[]> };

declare global {
  // eslint-disable-next-line no-var
  var __celoDb: Promise<Engine> | undefined;
}

/**
 * The connection string, under whichever name the host set it. Vercel's Neon
 * integration uses DATABASE_URL / POSTGRES_URL, or prefixes them (e.g.
 * STORAGE_DATABASE_URL) when a custom prefix was chosen.
 */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING']) {
    if (env[k]) return env[k]!;
  }
  const prefixed = Object.keys(env)
    .filter((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k])
    .sort();
  return prefixed.length ? env[prefixed[0]]! : null;
}

async function open(): Promise<Engine> {
  const url = databaseUrl();
  if (url) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url, {
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
      prepare: false, // Neon's pooler and pgbouncer don't support prepared statements
      max: 3,
      idle_timeout: 20,
      types: { bigint: postgres.BigInt },
    });
    const engine: Engine = {
      query: async (text, params) => (await sql.unsafe(text, params as never[])) as unknown as Row[],
    };
    await sql.unsafe(SCHEMA);
    return engine;
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add a Neon (or any Postgres) connection string in Vercel → Settings → Environment Variables.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.CELO_DATA_DIR ?? path.join(process.cwd(), '.data', 'pg');
  const db = new PGlite(dir === 'memory' ? undefined : dir);
  await db.exec(SCHEMA);
  return { query: async (text, params) => (await db.query<Row>(text, params)).rows };
}

function engine(): Promise<Engine> {
  if (!globalThis.__celoDb) {
    globalThis.__celoDb = open().catch((err) => {
      globalThis.__celoDb = undefined;
      throw err;
    });
  }
  return globalThis.__celoDb;
}

/** Run a parameterised query ($1, $2, ...) and return typed rows. */
export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const e = await engine();
  return (await e.query(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
