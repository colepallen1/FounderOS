/**
 * Session tokens and secret encryption on Web Crypto, so the same code runs in
 * middleware (edge) and route handlers (node).
 */
const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function sign(payload: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return b64url(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token = "<expiresAtMs>.<hmac>". */
export async function makeSessionToken(secret: string, ttlMs: number, now = Date.now()): Promise<string> {
  const exp = String(now + ttlMs);
  return `${exp}.${await sign(`session:${exp}`, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await sign(`session:${exp}`, secret));
}

export async function passwordMatches(input: string, expected: string, secret: string): Promise<boolean> {
  // Compare HMACs so the comparison is constant-length regardless of input.
  return safeEqual(await sign(`pw:${input}`, secret), await sign(`pw:${expected}`, secret));
}

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`celo-vault:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM. Output "v1.<iv>.<ciphertext>". */
export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(plain));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(blob: string, secret: string): Promise<string | null> {
  const [v, iv, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(secret), fromB64url(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
