import { normalize, SOURCES, type Payload, type Source } from './data';
export const CACHE_KEY = 'codex-reset-observer:v2';
export const LEGACY_KEY = 'codex-reset-observer:v1';
export const ATTEMPT_KEY = 'codex-reset-observer:last-attempt';
export interface Part { raw: unknown; fetchedAt: string }
export interface RequestState { outcome: 'waiting'|'success'|'failed'; attemptedAt?: string; lastOutcome?: 'success'|'failed'; error?: string }
export interface Reading { source: Source; parts: Record<string, Part>; errors: Record<string,string>; requests:Record<string,RequestState>; payload: Payload | null; cached: boolean }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function parse(source: Source, parts: Record<string, Part>) {
  try { return normalize(source.id, Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.raw]))); } catch { return null; }
}
export function readCache(storage?: StorageLike): Reading[] {
  let cache: Record<string,any> = {}, legacy=false;
  try { const saved=storage?.getItem(CACHE_KEY); legacy=!saved; cache=JSON.parse(saved||storage?.getItem(LEGACY_KEY)||'{}'); } catch { /* Corrupt or disabled storage never blocks the page. */ }
  return SOURCES.map(source=>{
    const saved=cache?.[source.id], rawParts=legacy?saved:saved?.parts;
    const parts:Record<string,Part>={},requests:Record<string,RequestState>={},errors:Record<string,string>={};
    for(const ep of source.endpoints){
      const p=rawParts?.[ep.part];
      if(p&&typeof p.fetchedAt==='string'&&Number.isFinite(Date.parse(p.fetchedAt))&&p.raw) parts[ep.part]=p;
      const old=saved?.requests?.[ep.part];
      const lastOutcome=old?.outcome==='waiting'?old.lastOutcome:old?.outcome;
      requests[ep.part]={outcome:'waiting',lastOutcome:['success','failed'].includes(lastOutcome)?lastOutcome:undefined,attemptedAt:old?.attemptedAt,error:typeof old?.error==='string'?old.error:undefined};
      if(lastOutcome==='failed'&&requests[ep.part].error)errors[ep.part]=requests[ep.part].error!;
    }
    return {source,parts,requests,errors,payload:parse(source,parts),cached:Object.keys(parts).length>0};
  });
}
export function writeCache(readings:Reading[],storage?:StorageLike):boolean {
  try{storage?.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(readings.map(r=>[r.source.id,{parts:r.parts,requests:r.requests}]))));return !!storage;}catch{return false;}
}
export async function fetchJson(url:string,fetcher:typeof fetch=fetch,timeout=15000):Promise<unknown>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetcher(url,{signal:controller.signal,cache:'no-cache',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(e){
    if(controller.signal.aborted)throw new Error('请求超时');
    throw new Error(e instanceof SyntaxError?'来源返回了非 JSON 内容':e instanceof Error&&/^HTTP/.test(e.message)?e.message:'连接失败或来源限制跨域访问');
  }finally{clearTimeout(timer);}
}
export async function refreshReading(previous:Reading,fetcher:typeof fetch=fetch):Promise<Reading>{
  const parts={...previous.parts},requests={...previous.requests},errors:Record<string,string>={};
  await Promise.all(previous.source.endpoints.map(async ep=>{
    const attemptedAt=new Date().toISOString();
    try{
      const raw=await fetchJson(ep.url,fetcher);normalize(previous.source.id,{[ep.part]:raw});
      parts[ep.part]={raw,fetchedAt:new Date().toISOString()};requests[ep.part]={outcome:'success',attemptedAt,lastOutcome:'success'};
    }catch(e){const error=e instanceof Error?e.message:'读取失败';errors[ep.part]=error;requests[ep.part]={outcome:'failed',lastOutcome:'failed',attemptedAt,error};}
  }));
  return {source:previous.source,parts,requests,errors,payload:parse(previous.source,parts),cached:Object.keys(errors).some(k=>!!parts[k])};
}
export function storageOrUndefined():Storage|undefined{try{return window.localStorage;}catch{return undefined;}}
export function lastAttempt(storage?:StorageLike):number{try{const n=Number(storage?.getItem(ATTEMPT_KEY));return Number.isFinite(n)&&n<=Date.now()?n:0;}catch{return 0;}}
export function cooldownDelay(attempted:number,now=Date.now()){return Math.max(0,60000-(now-attempted));}
export function sourceState(r:Reading):string{
  const states=Object.values(r.requests).map(s=>s.outcome);
  if(states.some(s=>s==='waiting'))return r.payload?'本机缓存／等待更新':'等待更新';
  if(states.every(s=>s==='success'))return '本次连接成功';
  if(states.some(s=>s==='success'))return '部分请求失败';
  return r.payload?'请求失败／本机缓存':'本次请求失败';
}
