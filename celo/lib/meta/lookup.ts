import 'server-only';
import { accountToken } from './connections';
import { graph, graphAll } from './graph';

/** Preview placements (AdPreview.AdFormat in Meta's Business SDK v26). */
export const PREVIEW_FORMATS = [
  { id: 'MOBILE_FEED_STANDARD', label: 'Facebook feed' },
  { id: 'INSTAGRAM_STANDARD', label: 'Instagram feed' },
  { id: 'INSTAGRAM_STORY', label: 'Instagram stories' },
  { id: 'INSTAGRAM_REELS', label: 'Instagram reels' },
  { id: 'FACEBOOK_STORY_MOBILE', label: 'Facebook stories' },
] as const;

/** Meta returns an <iframe> snippet; keep only a facebook.com https src, never raw HTML. */
export function previewSrc(body: string): string | null {
  const m = /src="([^"]+)"/.exec(body);
  if (!m) return null;
  const src = m[1].replace(/&amp;/g, '&');
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && (u.hostname === 'www.facebook.com' || u.hostname === 'business.facebook.com') ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function adPreview(act: string, adId: string, format: string): Promise<string | null> {
  const { token } = await accountToken(act);
  const r = await graph<{ data: { body: string }[] }>(token, `${adId}/previews`, { params: { ad_format: format } });
  return r.data[0] ? previewSrc(r.data[0].body) : null;
}

/** Preview a creative that does not exist yet (nothing is created). */
export async function draftPreview(act: string, storySpec: Record<string, unknown>, format: string): Promise<string | null> {
  const { token } = await accountToken(act);
  const r = await graph<{ data: { body: string }[] }>(token, `${act}/generatepreviews`, { params: { creative: { object_story_spec: storySpec }, ad_format: format } });
  return r.data[0] ? previewSrc(r.data[0].body) : null;
}

export async function pages(act: string) {
  const { token } = await accountToken(act);
  return graphAll<{ id: string; name: string }>(token, `${act}/promote_pages`, { fields: 'id,name' }, 3);
}

export async function pixels(act: string) {
  const { token } = await accountToken(act);
  return graphAll<{ id: string; name: string }>(token, `${act}/adspixels`, { fields: 'id,name' }, 3);
}

export async function audiences(act: string) {
  const { token } = await accountToken(act);
  return graphAll<{ id: string; name: string; approximate_count_lower_bound?: number; subtype?: string }>(token, `${act}/customaudiences`, { fields: 'id,name,subtype,approximate_count_lower_bound' }, 5);
}

export type GeoHit = { key: string; name: string; type: string; region?: string; country_code?: string };
export async function searchGeo(act: string, query: string): Promise<GeoHit[]> {
  const { token } = await accountToken(act);
  const r = await graph<{ data: GeoHit[] }>(token, 'search', { params: { type: 'adgeolocation', q: query, location_types: ['city', 'region', 'zip', 'country'], limit: 10 } });
  return r.data;
}

export type InterestHit = { id: string; name: string; audience_size_lower_bound?: number; path?: string[] };
export async function searchInterests(act: string, query: string): Promise<InterestHit[]> {
  const { token } = await accountToken(act);
  const r = await graph<{ data: InterestHit[] }>(token, `${act}/targetingsearch`, { params: { q: query, limit: 10 } });
  return r.data;
}
