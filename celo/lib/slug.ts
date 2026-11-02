export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'client'
  );
}

/** "acme.com, https://www.foo.io/x, bob@bar.co" -> ["acme.com","foo.io","bar.co"] */
export function parseDomains(input: string): string[] {
  const out = new Set<string>();
  for (const raw of input.split(/[\s,]+/)) {
    let s = raw.trim().toLowerCase();
    if (!s) continue;
    if (s.includes('@')) s = s.split('@').pop()!;
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) out.add(s);
  }
  return [...out];
}

export function emailDomain(email: string): string | null {
  const m = /@([^>\s]+)/.exec(email.toLowerCase());
  return m ? m[1].replace(/^www\./, '') : null;
}
