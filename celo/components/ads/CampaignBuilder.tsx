'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { builderLookups, findGeo, findInterests, previewDraft, submitPlan } from '@/lib/meta/ui-actions';
import type { CampaignPlan } from '@/lib/meta/actions';
import { Icon } from '../Icon';

type Opt = { id: string; name: string };
type Geo = { key: string; name: string; type: string; region?: string; country_code?: string };
const OBJECTIVES: { id: CampaignPlan['objective']; label: string; note: string }[] = [
  { id: 'OUTCOME_LEADS', label: 'Leads', note: 'Optimises for the pixel Lead event' },
  { id: 'OUTCOME_SALES', label: 'Sales', note: 'Optimises for the pixel Purchase event' },
  { id: 'OUTCOME_TRAFFIC', label: 'Traffic', note: 'Optimises for link clicks' },
  { id: 'OUTCOME_ENGAGEMENT', label: 'Engagement', note: 'Optimises for post engagement' },
  { id: 'OUTCOME_AWARENESS', label: 'Awareness', note: 'Optimises for reach' },
];
const CTAS = ['LEARN_MORE', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'GET_QUOTE', 'SHOP_NOW', 'APPLY_NOW', 'SUBSCRIBE', 'CALL_NOW', 'GET_OFFER'];
const POSITIONS = [
  { platform: 'facebook', pos: 'feed', label: 'Facebook feed' },
  { platform: 'instagram', pos: 'stream', label: 'Instagram feed' },
  { platform: 'instagram', pos: 'story', label: 'Instagram stories' },
  { platform: 'instagram', pos: 'reels', label: 'Instagram reels' },
  { platform: 'facebook', pos: 'story', label: 'Facebook stories' },
];

export function CampaignBuilder({ accountId, currency }: { accountId: string; currency: string }) {
  const router = useRouter();
  const [lookups, setLookups] = useState<{ pages: Opt[]; pixels: Opt[]; audiences: Opt[] } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<CampaignPlan['objective']>('OUTCOME_LEADS');
  const [budget, setBudget] = useState('30');
  const [geo, setGeo] = useState<Geo[]>([]);
  const [radius, setRadius] = useState('15');
  const [ageMin, setAgeMin] = useState('25');
  const [ageMax, setAgeMax] = useState('65');
  const [genders, setGenders] = useState<number[]>([]);
  const [interests, setInterests] = useState<Opt[]>([]);
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [advantage, setAdvantage] = useState(true);
  const [positions, setPositions] = useState<string[]>(POSITIONS.map((p) => `${p.platform}:${p.pos}`));
  const [special, setSpecial] = useState<string>('');
  const [pageId, setPageId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [imageUrl, setImageUrl] = useState('');
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{ label: string; src: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    builderLookups(accountId).then((r) => {
      if (r.ok) {
        setLookups(r.data!);
        if (r.data!.pages[0]) setPageId(r.data!.pages[0].id);
        if (r.data!.pixels[0]) setPixelId(r.data!.pixels[0].id);
      } else setLookupError(r.error);
    });
  }, [accountId]);

  const plan = (): CampaignPlan => {
    const cities = geo.filter((g) => g.type === 'city').map((g) => ({ key: g.key, radius: Number(radius) || 15, distance_unit: 'mile' as const }));
    const regions = geo.filter((g) => g.type === 'region').map((g) => ({ key: g.key }));
    const zips = geo.filter((g) => g.type === 'zip').map((g) => ({ key: g.key }));
    const countries = geo.filter((g) => g.type === 'country').map((g) => g.country_code ?? g.key);
    const fb = positions.filter((p) => p.startsWith('facebook:')).map((p) => p.split(':')[1]);
    const ig = positions.filter((p) => p.startsWith('instagram:')).map((p) => p.split(':')[1]);
    return {
      name: name.trim(),
      objective,
      daily_budget: Math.round(Number(budget) * 100),
      special_ad_categories: special ? [special] : [],
      targeting: {
        geo_locations: { ...(countries.length ? { countries } : {}), ...(cities.length ? { cities } : {}), ...(regions.length ? { regions } : {}), ...(zips.length ? { zips } : {}), ...(geo.length ? {} : { countries: ['US'] }) },
        age_min: Number(ageMin) || 18,
        age_max: Number(ageMax) || 65,
        ...(genders.length ? { genders } : {}),
        ...(interests.length ? { flexible_spec: [{ interests: interests.map((i) => ({ id: i.id, name: i.name })) }] } : {}),
        ...(include.length ? { custom_audiences: include.map((id) => ({ id })) } : {}),
        ...(exclude.length ? { excluded_custom_audiences: exclude.map((id) => ({ id })) } : {}),
        ...(advantage ? {} : { publisher_platforms: [...new Set([...(fb.length ? ['facebook'] : []), ...(ig.length ? ['instagram'] : [])])], facebook_positions: fb, instagram_positions: ig }),
      },
      advantage_placements: advantage,
      pixel_id: pixelId || undefined,
      page_id: pageId,
      creative: { link: link.trim(), message: message.trim(), headline: headline.trim(), description: description.trim() || undefined, cta, image_url: imageUrl.trim() || undefined, image_base64: imageB64 ?? undefined },
    };
  };

  const preview = () =>
    start(async () => {
      setError(null);
      const r = await previewDraft(accountId, { ...plan(), creative: { ...plan().creative, image_base64: undefined } });
      if (r.ok) setPreviews(r.data!);
      else setError(r.error);
    });
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await submitPlan(accountId, plan());
      if (r.ok) router.push(`/ads?account=${accountId}`);
      else setError(r.error);
    });

  const onFile = (f: File | undefined) => {
    if (!f) return setImageB64(null);
    if (f.size > 4 * 1024 * 1024) return setError('Image must be under 4 MB.');
    const reader = new FileReader();
    reader.onload = () => setImageB64(String(reader.result).split(',')[1] ?? null);
    reader.readAsDataURL(f);
  };

  return (
    <>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        {lookupError && <div className="panel p-4 text-[13px] text-bad">{lookupError}</div>}
        <Section title="Campaign">
          <Field label="Campaign name"><input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Smile Dental · Implants · Nov" /></Field>
          <div className="grid gap-2 sm:grid-cols-5">
            {OBJECTIVES.map((o) => (
              <button key={o.id} type="button" onClick={() => setObjective(o.id)} className={`border p-2.5 text-left ${objective === o.id ? 'border-accent/70 bg-accent/10' : 'border-line hover:border-muted/50'}`} style={{ borderRadius: 'var(--radius)' }}>
                <div className="text-[13px] text-ink">{o.label}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-faint">{o.note}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Daily budget (${currency})`}><input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="field" /></Field>
            <Field label="Special ad category">
              <select value={special} onChange={(e) => setSpecial(e.target.value)} className="field">
                <option value="">None</option>
                <option value="HOUSING">Housing</option>
                <option value="EMPLOYMENT">Employment</option>
                <option value="FINANCIAL_PRODUCTS_SERVICES">Financial products</option>
                <option value="ISSUES_ELECTIONS_POLITICS">Social issues / politics</option>
              </select>
            </Field>
            {(objective === 'OUTCOME_LEADS' || objective === 'OUTCOME_SALES') && (
              <Field label="Pixel">
                <select value={pixelId} onChange={(e) => setPixelId(e.target.value)} className="field">
                  <option value="">Choose a pixel</option>
                  {lookups?.pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          {special && <p className="text-[11.5px] text-warn">Special ad categories restrict age, gender and radius targeting by Meta's rules.</p>}
        </Section>

        <Section title="Audience">
          <SearchAdd
            label="Locations"
            placeholder="Fort Lauderdale, 33301, Florida..."
            search={async (t) => {
              const r = await findGeo(accountId, t);
              return r.ok ? r.data.map((g) => ({ id: g.key, name: `${g.name}${g.region ? `, ${g.region}` : ''} · ${g.type}`, raw: g })) : [];
            }}
            chosen={geo.map((g) => ({ id: g.key, name: `${g.name} · ${g.type}` }))}
            onAdd={(x) => setGeo((cur) => (cur.some((g) => g.key === x.id) ? cur : [...cur, (x as unknown as { raw: Geo }).raw]))}
            onRemove={(id) => setGeo((cur) => cur.filter((g) => g.key !== id))}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="City radius (mi)"><input value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="numeric" className="field" /></Field>
            <Field label="Age from"><input value={ageMin} onChange={(e) => setAgeMin(e.target.value)} inputMode="numeric" className="field" /></Field>
            <Field label="Age to"><input value={ageMax} onChange={(e) => setAgeMax(e.target.value)} inputMode="numeric" className="field" /></Field>
            <Field label="Gender">
              <select value={genders.join(',')} onChange={(e) => setGenders(e.target.value ? e.target.value.split(',').map(Number) : [])} className="field">
                <option value="">All</option>
                <option value="1">Men</option>
                <option value="2">Women</option>
              </select>
            </Field>
          </div>
          <SearchAdd
            label="Interests (detailed targeting)"
            placeholder="Dental implants, home improvement..."
            search={async (t) => {
              const r = await findInterests(accountId, t);
              return r.ok ? r.data.map((i) => ({ id: i.id, name: i.name })) : [];
            }}
            chosen={interests}
            onAdd={(x) => setInterests((cur) => (cur.some((i) => i.id === x.id) ? cur : [...cur, { id: x.id, name: x.name }]))}
            onRemove={(id) => setInterests((cur) => cur.filter((i) => i.id !== id))}
          />
          {!!lookups?.audiences.length && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Include saved audiences">
                <select multiple value={include} onChange={(e) => setInclude([...e.target.selectedOptions].map((o) => o.value))} className="field h-24">
                  {lookups.audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Exclude saved audiences">
                <select multiple value={exclude} onChange={(e) => setExclude([...e.target.selectedOptions].map((o) => o.value))} className="field h-24">
                  {lookups.audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          )}
        </Section>

        <Section title="Placements">
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} className="accent-[rgb(var(--accent))]" />
            Advantage+ placements (Meta chooses where to show it)
          </label>
          {!advantage && (
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((p) => {
                const k = `${p.platform}:${p.pos}`;
                const on = positions.includes(k);
                return (
                  <button key={k} type="button" onClick={() => setPositions((c) => (on ? c.filter((x) => x !== k) : [...c, k]))} className={`border px-3 py-1.5 text-[12.5px] ${on ? 'border-accent/70 bg-accent/10 text-accent-hi' : 'border-line text-muted'}`} style={{ borderRadius: 'var(--radius)' }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Ad">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Facebook Page">
              <select value={pageId} onChange={(e) => setPageId(e.target.value)} className="field">
                <option value="">Choose a Page</option>
                {lookups?.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Website link"><input value={link} onChange={(e) => setLink(e.target.value)} className="field" placeholder="https://..." /></Field>
          </div>
          <Field label="Primary text"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="field resize-y" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Headline"><input value={headline} onChange={(e) => setHeadline(e.target.value)} className="field" /></Field>
            <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="field" /></Field>
            <Field label="Button">
              <select value={cta} onChange={(e) => setCta(e.target.value)} className="field">
                {CTAS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Image URL"><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="field" placeholder="https://.../image.jpg" /></Field>
            <Field label="or upload an image"><input type="file" accept="image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0])} className="field py-1.5 text-[12.5px]" /></Field>
          </div>
          {imageB64 && <p className="text-[11.5px] text-faint">Uploaded images are sent to Meta when the campaign is approved; previews use the image URL.</p>}
        </Section>
      </div>

      <div className="space-y-4">
        <div className="panel sticky top-20 p-5">
          <div className="eyebrow">Review</div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-muted">
            <li><span className="text-ink">{name || 'Untitled campaign'}</span></li>
            <li>{OBJECTIVES.find((o) => o.id === objective)?.label} · {currency} {budget || 0}/day</li>
            <li>{geo.length ? geo.map((g) => g.name).join(', ') : 'United States'} · {ageMin}-{ageMax}{genders.length ? (genders[0] === 1 ? ' · men' : ' · women') : ''}</li>
            <li>{interests.length ? `${interests.length} interests` : 'No detailed targeting (Advantage+ audience)'}</li>
            <li>{advantage ? 'Advantage+ placements' : `${positions.length} placements`}</li>
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-faint">
            Sending for approval queues it. When approved it is created in Meta with the campaign, ad set and ad all <span className="text-muted">paused</span>. Turning it on is a separate approval.
          </p>
          {error && <p className="mt-3 text-[12.5px] text-bad">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={preview} disabled={pending || !pageId} className="btn-ghost" type="button">
              {pending ? 'Working' : 'Preview'}
            </button>
            <button onClick={submit} disabled={pending} className="btn" type="button">
              <Icon name="check" size={13} /> Send for approval
            </button>
          </div>
        </div>
      </div>
    </div>
    {previews && (
          <div className="panel mt-4 p-5">
            <div className="eyebrow mb-3">Preview from Meta (nothing created)</div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {previews.map((p) => (
                <div key={p.label} className="shrink-0">
                  <div className="mb-1 text-[11px] text-faint">{p.label}</div>
                  {p.src ? <iframe src={p.src} title={p.label} className="h-[520px] w-[320px] border-0 bg-white" /> : <div className="flex h-[120px] w-[320px] items-center justify-center border border-line text-[12px] text-faint">No preview returned</div>}
                </div>
              ))}
            </div>
          </div>
        )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-4 p-5">
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function SearchAdd({ label, placeholder, search, chosen, onAdd, onRemove }: { label: string; placeholder: string; search: (t: string) => Promise<{ id: string; name: string }[]>; chosen: { id: string; name: string }[]; onAdd: (x: { id: string; name: string }) => void; onRemove: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (term.trim().length < 2) return setHits([]);
    const t = setTimeout(() => start(async () => setHits(await search(term.trim()))), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="relative">
        <input value={term} onChange={(e) => setTerm(e.target.value)} className="field" placeholder={placeholder} aria-label={label} />
        {pending && <span className="absolute right-3 top-2.5 text-[11px] text-faint">searching</span>}
        {hits.length > 0 && (
          <ul className="panel absolute z-20 mt-1 max-h-60 w-full overflow-y-auto bg-surface">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => { onAdd(h as never); setTerm(''); setHits([]); }} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-accent/10" {...{ 'data-raw': JSON.stringify(h) }}>
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {chosen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-2 py-1 text-[12px] text-accent-hi" style={{ borderRadius: 'var(--radius)' }}>
              {c.name}
              <button type="button" onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
