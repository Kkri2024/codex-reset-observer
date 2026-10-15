export type Kind = 'global' | 'banked' | 'signal';
export type Zone = 'Asia/Shanghai' | 'UTC';
export interface Event {
  id: string; at: string; dayOnly: boolean; title: string; kind: Kind;
  scope: string; status: string; evidence: string; url: string;
  origins: string[]; conflict?: boolean; timeBasis?: string;
}
export interface Forecast {
  p24: number | null; p48: number | null; at: string | null; method: string; methodUrl: string; sample?: number;
  generatedAt?: string | null; basisAt?: string | null; basisPrecision?: 'minute' | 'day' | 'estimated' | 'unknown';
  sampleKind?: 'events' | 'backtest'; explanation?: string;
}
export interface Payload { events: Event[]; forecast: Forecast | null; updated: string | null; coverage: string; historyAvailable: boolean }
export interface Source { id: string; name: string; home: string; endpoints: { part: string; url: string }[] }
export const SOURCES: Source[] = [
  { id: 'dev', name: 'Codex Reset · dev', home: 'https://codexreset.dev', endpoints: [
    { part: 'status', url: 'https://codexreset.dev/api/status?lang=zh' },
    { part: 'history', url: 'https://codexreset.dev/api/history?lang=zh' },
    { part: 'forecast', url: 'https://codexreset.dev/api/forecast?lang=zh' },
  ] },
  { id: 'ai', name: 'Codex Reset · ai', home: 'https://codexreset.ai', endpoints: [{ part: 'forecast', url: 'https://codexreset.ai/api/v1/forecast.json' }] },
  { id: 'app', name: 'Codex Reset · app', home: 'https://codexreset.app', endpoints: [{ part: 'signal', url: 'https://codexreset.app/api/signal' }] },
];
type Obj = Record<string, any>;
const obj = (x: unknown): Obj => x && typeof x === 'object' && !Array.isArray(x) ? x as Obj : {};
const str = (x: unknown): string => typeof x === 'string' ? x : '';
const text = (x: unknown): string => Array.isArray(x) ? x.filter(v=>typeof v==='string').join(' ') : str(x);
export function safeUrl(x: unknown): string { try { const u = new URL(str(x)); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
function date(x: unknown): string | null { const s = str(x); return s && Number.isFinite(Date.parse(s)) ? s : null; }
function firstDate(...xs: unknown[]): string | null { return xs.map(date).find(Boolean) ?? null; }
export function percent(x: unknown, fraction = false): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const p = fraction ? x * 100 : x;
  return p >= 0 && p <= 100 ? Math.round(p * 10) / 10 : null;
}
function event(raw: unknown, source: string): Event | null {
  const r = obj(raw), evidence = obj(r.source), at = firstDate(r.timestamp, r.date, r.announced_at, r.announcedAt, r.effective_at, r.occurred_at, r.at);
  if (!at || Date.parse(at) > Date.now()) return null;
  const type = str(r.type || r.event_type || r.kind), status = str(r.status || r.verification_status || r.kind);
  let kind: Kind = ['banked','banked_reset','banked_reset_grant','reset_credit','reset_credits','credit','grant'].includes(type) ? 'banked' : ['global','global_reset','confirmed','quota_reset','reset','regular'].includes(type) ? 'global' : 'signal';
  if (/planned|preview|signal|pending|unverified/.test(status)) kind = 'signal';
  const url = safeUrl(r.source_url || r.sourceUrl || r.evidence_url || r.original_url || evidence.url || r.url);
  return { id: str(r.id) || `${source}:${at}:${type}`, at, dayOnly: r.time_precision === 'day' || /^\d{4}-\d{2}-\d{2}$/.test(at),
    title: str(r.title || r.summary) || (kind === 'global' ? '公共额度重置' : kind === 'banked' ? '赠送重置次数' : '待确认消息'),
    kind, status: status || 'recorded', scope: str(r.scope || r.applies_to) || '来源未说明适用范围',
    evidence: str(r.evidence_text || r.quote || r.description), url, origins: [source], timeBasis: str(r.time_basis) };
}
function unwrap(raw: unknown): Obj { const r = obj(raw); return r.data && !Array.isArray(r.data) ? obj(r.data) : r; }
function eventsIn(raw: unknown): unknown[] { if (Array.isArray(raw)) return raw; const r = unwrap(raw); for (const k of ['events','history','records','items','resets','data']) if (Array.isArray(r[k])) return r[k]; return []; }
export function normalize(id: string, parts: Record<string, unknown>): Payload {
  const status = unwrap(parts.status), hist = unwrap(parts.history), f0 = unwrap(parts.forecast), app = unwrap(parts.signal);
  let forecast: Forecast | null = null;
  let rawEvents: unknown[] = [];
  let updated: string | null = null;
  if (id === 'dev') {
    rawEvents = [...eventsIn(parts.history), ...eventsIn(parts.status), status.latestGlobalReset, status.latestBankedReset, status.latestResetEvent].filter(Boolean);
    const f = Object.keys(obj(f0.forecast)).length ? obj(f0.forecast) : f0;
    const probs = obj(f.probabilities);
    if (parts.forecast && Object.keys(f).length) forecast = {
      p24: percent(f.probability_24h ?? f.probability24h ?? probs.next24h), p48: percent(f.probability_48h ?? f.probability48h ?? probs.next48h),
      at: firstDate(f.data_as_of, f.updated_at, f.generated_at, f.updatedAt),
      method: text(f.explanation || f.method || f.model) || '来源未提供计算说明', methodUrl: safeUrl(f.method_url) || 'https://codexreset.dev/api/', sample: typeof f.sample_size === 'number' ? f.sample_size : undefined,
    };
    updated = firstDate(status.resetArchiveSyncedAt, status.historyUpdatedAt, hist.updated_at, hist.synced_at, status.updated_at, status.lastChecked);
  } else if (id === 'ai') {
    const p = obj(f0.probabilities);
    if (f0.available !== false && Object.keys(p).length) forecast = { p24: percent(p.raw_24h, true), p48: percent(p.raw_48h, true), at: firstDate(f0.source_updated_at, f0.generated_at), method: str(f0.model) || '历史间隔频率估算', methodUrl: safeUrl(f0.method_url), sample: typeof obj(f0.backtest).cases === 'number' ? f0.backtest.cases : undefined };
    updated = firstDate(f0.source_updated_at, f0.generated_at);
  } else {
    const f = obj(app.forecast);
    if (Object.keys(f).length) forecast = { p24: percent(f.probability24h), p48: percent(f.probability48h), at: firstDate(app.dataAsOf, app.generatedAt), method: str(f.narrative) || '公开信号启发式估算', methodUrl: 'https://codexreset.app/methodology' };
    rawEvents = [app.lastConfirmedReset, ...eventsIn({ events: app.recentEvents })].filter(Boolean);
    updated = firstDate(app.dataAsOf, app.generatedAt);
  }
  if (forecast) {
    const raw = id==='app' ? obj(app.forecast) : id==='dev' && Object.keys(obj(f0.forecast)).length ? obj(f0.forecast) : f0;
    forecast.generatedAt = firstDate(raw.generated_at, raw.generatedAt, app.generatedAt);
    forecast.basisAt = firstDate(raw.last_reset_at, raw.lastResetAt, raw.last_global_reset_at, obj(app.lastConfirmedReset).timestamp);
    forecast.basisPrecision = forecast.basisAt ? /^\d{4}-\d{2}-\d{2}$/.test(forecast.basisAt) ? 'day' : 'minute' : 'unknown';
    if (!forecast.basisAt && id==='ai' && typeof f0.hours_since_last==='number' && Number.isFinite(f0.hours_since_last) && f0.hours_since_last>=0 && forecast.generatedAt) {
      forecast.basisAt = new Date(Date.parse(forecast.generatedAt)-f0.hours_since_last*3600000).toISOString();
      forecast.basisPrecision = 'estimated';
    }
    forecast.sampleKind = id==='ai' ? 'backtest' : 'events';
    forecast.explanation = id==='ai' ? '按历史公共重置间隔计算频率；等待更久不会自动提高概率。' : id==='app' ? '结合公开消息、服务状态与社区信号作启发式估算。' : forecast.method;
  }
  const events = rawEvents.map(r => event(r, id)).filter((r): r is Event => !!r);
  const historyAvailable = id === 'dev' && (Array.isArray(parts.history) || ['events','history','records','items','resets','data'].some(k => Array.isArray(hist[k])));
  const recognized = historyAvailable || events.length > 0 || forecast !== null || ['latestGlobalReset','latestBankedReset','todayStatus','globalStatus','resetArchiveSyncedAt'].some(k => k in status);
  if (!recognized) throw new Error('来源响应格式已变化，暂时无法解析');
  return { events, forecast, updated, historyAvailable, coverage: str(hist.coverage || hist.coverage_note) || '第三方历史覆盖不完整；未收录不代表未发生。' };
}
function canonical(url: string) { if (!url) return ''; const u = new URL(url); u.search = ''; u.hash = ''; u.hostname = u.hostname.replace('twitter.com', 'x.com').replace('www.x.com','x.com'); return u.href.replace(/\/$/,''); }
export function mergeEvents(events: Event[]): Event[] {
  const map = new Map<string, Event>();
  for (const e of events) {
    // Only an exact announcement URL or provider record ID establishes identity.
    const post = canonical(e.url), key = /\/status\/\d+/.test(post) ? post : `${e.origins[0]}:${e.id}`;
    const prior = map.get(key);
    if (!prior) { map.set(key, { ...e, origins: [...e.origins] }); continue; }
    const origins = [...new Set([...prior.origins, ...e.origins])];
    const conflict = prior.kind !== e.kind || Date.parse(prior.at) !== Date.parse(e.at) || prior.dayOnly !== e.dayOnly || !!prior.conflict;
    if (conflict && !map.has(`${key}:variant:${e.at}:${e.kind}`)) map.set(`${key}:variant:${e.at}:${e.kind}`, { ...e, conflict: true });
    map.set(key, { ...prior, origins, conflict });
  }
  return [...map.values()].sort((a,b) => Date.parse(b.at) - Date.parse(a.at));
}
export function intervalStats(events: Event[]) {
  const global = events.filter(e => e.kind === 'global' && !e.conflict && !e.dayOnly);
  const times = [...new Set(global.map(e => Date.parse(e.at)))].sort((a,b) => a-b);
  const gaps = times.slice(1).map((t,i) => ({ at: new Date(t).toISOString(), days: (t-times[i])/86400000 }));
  const sorted = gaps.map(g=>g.days).sort((a,b)=>a-b), n=sorted.length;
  return { gaps, median: n ? n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2 : null, count: times.length };
}
export function formatTime(at: string | null, zone: Zone, dayOnly = false) {
  if (!at || !date(at)) return '未提供时间';
  if (dayOnly) return at.slice(0,10) + '（仅日期）';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(at));
}
export function monthOf(e: Event, zone: Zone): string {
  if (e.dayOnly) return e.at.slice(0,7);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year:'numeric', month:'2-digit' }).format(new Date(e.at));
}
export function isStale(at: string | null, now = Date.now()) { return !at || !Number.isFinite(Date.parse(at)) || now-Date.parse(at)>30*60*1000 || Date.parse(at)>now+5*60*1000; }
export function dayOf(at: string, zone: Zone, dayOnly=false) {
  return dayOnly ? at.slice(0,10) : new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
}
export type ForecastState = 'available' | 'different' | 'stale' | 'unpublished';
export function assessForecast(f: Forecast | null, latest: Event | undefined, now=Date.now()): { state:ForecastState; basisKnown:boolean } {
  const basisKnown=!!f?.basisAt && !!f.basisPrecision && !['unknown','day'].includes(f.basisPrecision) && !!latest && !latest.dayOnly && !latest.conflict;
  if(!f || (f.p24===null && f.p48===null)) return {state:'unpublished',basisKnown};
  if(isStale(f.at,now)) return {state:'stale',basisKnown};
  if(basisKnown && Date.parse(latest!.at)-Date.parse(f!.basisAt!)>3600000) return {state:'different',basisKnown};
  return {state:'available',basisKnown};
}
export function elapsed(at: string, now=Date.now()) {
  const mins=Math.max(0,Math.floor((now-Date.parse(at))/60000));
  return mins<1?'刚刚':mins<60?`${mins} 分钟前`:mins<1440?`${Math.floor(mins/60)} 小时 ${mins%60} 分钟前`:`${Math.floor(mins/1440)} 天 ${Math.floor(mins%1440/60)} 小时前`;
}
