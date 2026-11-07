import 'server-only';

/**
 * Minimal Marketing API (Graph) client. Field names and enums follow Meta's
 * official Business SDK (facebook-python-business-sdk v26.0.4), used as reference.
 */
export const GRAPH_VERSION = process.env.META_API_VERSION || 'v26.0';
const BASE = (process.env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, '');

/** Graph error codes that mean "slow down" (application, user, account and ads-insights throttling). */
const THROTTLE = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);
const PERMISSION = new Set([10, 200, 294]);

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly kind: 'permission' | 'throttle' | 'auth' | 'invalid' | 'other',
    readonly status: number,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | object | undefined>;

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    out.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return out;
}

function classify(code: number | null, status: number, message: string): GraphError['kind'] {
  if (code != null && THROTTLE.has(code)) return 'throttle';
  if (code === 190 || status === 401) return 'auth';
  if ((code != null && PERMISSION.has(code)) || /permission|ads_management|ads_read|business_management/i.test(message)) return 'permission';
  if (code === 100) return 'invalid';
  return 'other';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function graph<T>(token: string, path: string, opts: { method?: 'GET' | 'POST' | 'DELETE'; params?: Params; retries?: number } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const params = encode({ ...(opts.params ?? {}), access_token: token });
  const url = `${BASE}/${GRAPH_VERSION}/${path.replace(/^\//, '')}`;
  let attempt = 0;
  for (;;) {
    const res = await fetch(method === 'GET' ? `${url}?${params}` : url, {
      method,
      body: method === 'GET' ? undefined : params,
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
    if (res.ok && !json.error) return json;
    const code = json.error?.code ?? null;
    const message = json.error?.error_user_msg || json.error?.message || `Meta returned HTTP ${res.status}`;
    const kind = classify(code, res.status, message);
    if (kind === 'throttle' && attempt < (opts.retries ?? 3)) {
      await sleep(1500 * 2 ** attempt);
      attempt++;
      continue;
    }
    throw new GraphError(
      kind === 'permission'
        ? `Meta says this token lacks a permission for that (${message}). Regenerate the system-user token with ads_management, ads_read and business_management.`
        : kind === 'auth'
          ? `The Meta token is no longer valid (${message}). Generate a new system-user token and update the connection.`
          : message,
      code,
      kind,
      res.status,
    );
  }
}

/** Follow cursor pagination (max `pages` pages). */
export async function graphAll<T>(token: string, path: string, params: Params, pages = 20): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < pages; i++) {
    const r = await graph<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(token, path, { params: { limit: 200, ...params, ...(after ? { after } : {}) } });
    out.push(...(r.data ?? []));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

export const actId = (raw: string) => `act_${raw.trim().replace(/^act_/, '')}`;
