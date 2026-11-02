import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, makeSessionToken, passwordMatches, verifySessionToken } from '@/lib/token';

const S = 'test-secret-that-is-long-enough';

describe('sessions', () => {
  it('verifies its own token and rejects tampering, expiry and other secrets', async () => {
    const t = await makeSessionToken(S, 60_000, 1_000);
    expect(await verifySessionToken(t, S, 2_000)).toBe(true);
    expect(await verifySessionToken(t, S, 70_000)).toBe(false);
    expect(await verifySessionToken(t, 'another-secret-entirely-xx', 2_000)).toBe(false);
    const [exp, sig] = t.split('.');
    expect(await verifySessionToken(`${Number(exp) + 999999}.${sig}`, S, 2_000)).toBe(false);
    expect(await verifySessionToken(undefined, S)).toBe(false);
    expect(await verifySessionToken('garbage', S)).toBe(false);
  });
  it('compares passwords', async () => {
    expect(await passwordMatches('hunter2', 'hunter2', S)).toBe(true);
    expect(await passwordMatches('hunter3', 'hunter2', S)).toBe(false);
  });
});

describe('vault', () => {
  it('round-trips and refuses the wrong key', async () => {
    const blob = await encryptSecret('sk_live_abc', S);
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('sk_live');
    expect(await decryptSecret(blob, S)).toBe('sk_live_abc');
    expect(await decryptSecret(blob, 'wrong-secret-wrong-secret')).toBeNull();
    expect(await decryptSecret('nope', S)).toBeNull();
  });
});
