import { normalize, SOURCES, type Payload, type Source } from './data';
export const CACHE_KEY = 'codex-reset-observer:v1';
export const ATTEMPT_KEY = 'codex-reset-observer:last-attempt';
export interface Part { raw: unknown; fetchedAt: string }
export interface Reading { source: Source; parts: Record<string, Part>; errors: Record<string,string>; payload: Payload | null; cached: boolean }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function parse(source: Source, parts: Record<string, Part>) {
  try { return normalize(source.id, Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.raw]))); } catch { return null; }
}
export function readCache(storage?: StorageLike): Reading[] {
  let cache: Record<string,Record<string,Part>> = {};
  try { cache = JSON.parse(storage?.getItem(CACHE_KEY) || '{}'); } catch { /* Corrupt or disabled local storage must not prevent loading. */ }
  return SOURCES.map(source => {
    const parts: Record<string,Part> = {};
    for (const ep of source.endpoints) {
      const p = cache?.[source.id]?.[ep.part];
      if (p && typeof p.fetchedAt === 'string' && Number.isFinite(Date.parse(p.fetchedAt)) && p.raw) parts[ep.part] = p;
    }
    return { source, parts, payload: parse(source, parts), errors:{}, cached: Object.keys(parts).length>0 };
  });
}
export function writeCache(readings: Reading[], storage?: StorageLike): boolean {
  try { storage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(readings.map(r=>[r.source.id,r.parts])))); return !!storage; } catch { return false; }
}
export async function fetchJson(url: string, fetcher: typeof fetch = fetch, timeout = 15000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  try {
    const response = await fetcher(url, { signal:controller.signal, cache:'no-cache', credentials:'omit', referrerPolicy:'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    if (controller.signal.aborted) throw new Error('请求超时');
    throw new Error(e instanceof SyntaxError ? '来源返回了非 JSON 内容' : e instanceof Error && /^HTTP/.test(e.message) ? e.message : '连接失败或来源限制跨域访问');
  } finally { clearTimeout(timer); }
}
export async function refreshReading(previous: Reading, fetcher: typeof fetch = fetch): Promise<Reading> {
  const parts = { ...previous.parts }, errors: Record<string,string> = {};
  await Promise.all(previous.source.endpoints.map(async ep => {
    try {
      const raw = await fetchJson(ep.url, fetcher);
      // Validate each endpoint before overwriting its last good cache.
      normalize(previous.source.id, { [ep.part]: raw });
      parts[ep.part] = { raw, fetchedAt:new Date().toISOString() };
    } catch (e) { errors[ep.part] = e instanceof Error ? e.message : '读取失败'; }
  }));
  return { source:previous.source, parts, errors, payload:parse(previous.source,parts), cached: Object.keys(errors).some(k=>!!parts[k]) };
}
export function storageOrUndefined(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }
export function lastAttempt(storage?: StorageLike): number {
  try { const n=Number(storage?.getItem(ATTEMPT_KEY)); return Number.isFinite(n)&&n<=Date.now() ? n : 0; } catch { return 0; }
}
