export const PUBLIC_ID = 'codex-reset.com';
export const PUBLIC_HOME = 'https://codex-reset.com/';
type Row = Record<string, unknown>;
const row = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const string = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const list = (x: unknown) => Array.isArray(x) ? x : [];
const timestamp = (x: unknown) => {
  const s = string(x);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null;
};
function postLink(url: unknown, id: string) {
  const match = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/thsottiaux\/status\/(\d{10,25})(?:[/?#].*)?$/i.exec(string(url));
  return match && match[1] === id ? `https://x.com/thsottiaux/status/${id}` : '';
}
const newest = <T extends {at:string}>(items:T[]) => items.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));

export interface TiboPost {
  id: string; at: string; url: string; text: string; translation: string;
  reply: boolean; parent: string; relevant: boolean;
}
export function normalizeFeed(raw: unknown, now = Date.now()) {
  const r = row(raw), updated = timestamp(r.fetched_at);
  if (!updated || typeof r.stale !== 'boolean' || !Array.isArray(r.tweets) || string(row(r.profile).handle).toLowerCase() !== 'thsottiaux') {
    throw new Error('动态来源格式无法核对');
  }
  const unique = new Map<string,TiboPost>(), inconsistent = new Set<string>();
  for (const item of [...r.tweets, r.signal]) {
    const t = row(item), id = string(t.id), at = timestamp(t.at), url = postLink(t.url,id), text = string(t.text);
    if (!at || !url || !text || Date.parse(at) > now || Date.parse(at) > Date.parse(updated) + 300000) continue;
    const relevant = ['banked','reset'].includes(string(t.kind)) || t.explicit_reset_claim === true ||
      /\b(?:banked|global|quota|usage|limit(?:s)?)\s+(?:usage\s+)?resets?\b|\bresets?\b.{0,40}\b(?:codex|limits?|quota)\b/i.test(text);
    if (!relevant && t.tibo_lane !== 'reset_related') continue;
    const parentId = string(t.in_reply_to_tweet_id);
    const previous = unique.get(id);
    if (previous) {
      if (previous.text !== text || previous.at !== at) inconsistent.add(id);
      continue;
    }
    unique.set(id,{id,at,url,text,translation:r.locale === 'zh' && t.translation_status === 'translated' ? string(t.localized_text) : '',
      relevant,reply:t.is_reply === true,parent:t.is_reply === true && /^\d{10,25}$/.test(parentId) ? parentId : ''});
  }
  const entries = [...unique.values()].filter(t=>!inconsistent.has(t.id)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.id.localeCompare(a.id));
  if (r.tweets.length && !r.tweets.some(t=>postLink(row(t).url,string(row(t).id)) && timestamp(row(t).at) && string(row(t).text))) {
    throw new Error('动态来源没有可追溯的 Tibo 帖子');
  }
  return {updated, stale:r.stale, scope:string(r.source_scope), inconsistent:inconsistent.size, posts:entries};
}
export interface PublicRecord {
  id:string; at:string; kind:'banked'|'global'; status:'observed'|'announced'|'uncertain'; url:string;
  effective:string|null;
}
export function normalizeTimeline(raw:unknown, now=Date.now()) {
  const r=row(raw), updated=timestamp(r.updated_at);
  if (!updated || !Array.isArray(r.events)) throw new Error('时间线来源格式无法核对');
  const entries:PublicRecord[]=[];
  for (const item of list(r.events)) {
    const e=row(item), id=string(e.id), at=timestamp(e.announced_at), type=string(e.type), source=string(e.source);
    if (!id || !at || Date.parse(at)>now || !['credits','reset'].includes(type)) continue;
    if (type==='reset' && e.scope!=='global') continue;
    const url=postLink(e.url,id);
    const observed=['observed','operator-observed'].includes(source) &&
      (e.banked_state==='available'||e.observation_result==='reset_observed');
    if (!url && !observed) continue;
    const status=observed?'observed':e.preview===true||e.announcement_state==='announced'||e.banked_grant===true?'announced':'uncertain';
    const effective=timestamp(e.effective_at);
    entries.push({id,at,kind:type==='credits'?'banked':'global',status,url,effective});
  }
  return {updated,entries:newest(entries)};
}
export function normalizeAudit(raw:unknown) {
  const r=row(raw), b=row(r.backtest), updated=timestamp(r.updated_at);
  const score=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1?x:null;
  const model=score(b.brier), naive=score(b.baseline_brier), rate=score(b.rate_v2_brier);
  if (!updated || !Number.isSafeInteger(b.sample_size) || Number(b.sample_size)<=0 || model===null || naive===null || rate===null) {
    throw new Error('来源未提供可核对的回测对照');
  }
  return {updated,basis:timestamp(r.last_reset_at),sample:Number(b.sample_size),model,naive,rate};
}
export function publicStale(at:string, now:number) {
  const t=Date.parse(at);
  return !Number.isFinite(t)||t>now+300000||now-t>30*60000;
}
export interface AlertCursor { latest:number; ids:Set<string>; openedAt:number }
export function advanceAlerts(cursor:AlertCursor|null, posts:TiboPost[], openedAt = Date.now()) {
  const relevant=posts.filter(p=>p.relevant);
  const latest=Math.max(cursor?.latest??0,...relevant.map(p=>Date.parse(p.at)));
  const added=cursor ? relevant.filter(p=>Date.parse(p.at)>=cursor.latest&&Date.parse(p.at)>=cursor.openedAt&&!cursor.ids.has(p.id)) : [];
  // Older posts that enter the feed during a backfill do not count as new.
  const ids=new Set(relevant.filter(p=>Date.parse(p.at)===latest).map(p=>p.id));
  if(cursor?.latest===latest) for(const id of cursor.ids) ids.add(id);
  return {cursor:{latest,ids,openedAt:cursor?.openedAt??openedAt}, added};
}
