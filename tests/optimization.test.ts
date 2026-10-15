import {describe,it,expect} from 'vitest';
import {assessForecast,dayOf,normalize,type Forecast,type Event} from '../src/data';
import {CACHE_KEY,LEGACY_KEY,cooldownDelay,readCache,refreshReading,sourceState,writeCache} from '../src/store';
const now=Date.parse('2026-01-03T12:00:00Z');
const latest:Event={id:'test',at:'2026-01-03T11:00:00Z',dayOnly:false,title:'测试',kind:'global',scope:'测试',status:'recorded',evidence:'',url:'',origins:['dev']};
const f:Forecast={p24:0,p48:30,at:'2026-01-03T11:59:00Z',method:'test',methodUrl:'',basisAt:'2026-01-01T00:00:00Z',basisPrecision:'minute'};
const storage=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};
describe('prediction basis and freshness',()=>{
 it('flags a fresh response with an older event basis without changing probability',()=>{expect(assessForecast(f,latest,now).state).toBe('different');expect(f.p24).toBe(0);});
 it('allows a basis difference of exactly one hour',()=>expect(assessForecast({...f,basisAt:'2026-01-03T10:00:00Z'},latest,now).state).toBe('available'));
 it('does not claim comparison when either date precision is insufficient',()=>{expect(assessForecast({...f,basisPrecision:'day'},latest,now).basisKnown).toBe(false);expect(assessForecast(f,{...latest,dayOnly:true},now).basisKnown).toBe(false);});
 it('separates no estimate from stale data',()=>{expect(assessForecast({...f,p24:null,p48:null},latest,now).state).toBe('unpublished');expect(assessForecast({...f,at:'2026-01-01'},latest,now).state).toBe('stale');});
 it('infers ai event basis from generation time, not last fetch',()=>{const p=normalize('ai',{forecast:{available:true,probabilities:{raw_24h:0.1},hours_since_last:24,generated_at:'2026-01-03T00:00:00Z',source_updated_at:'2026-01-03T01:00:00Z',backtest:{cases:123}}});expect(p.forecast?.basisAt).toBe('2026-01-02T00:00:00.000Z');expect(p.forecast?.basisPrecision).toBe('estimated');expect(p.forecast?.sampleKind).toBe('backtest');});
 it('does not infer a basis from invalid elapsed hours',()=>expect(normalize('ai',{forecast:{probabilities:{raw_24h:0},hours_since_last:-4,generated_at:'2026-01-01'}}).forecast?.basisAt).toBeNull());
 it('uses the selected timezone for the day boundary',()=>{expect(dayOf('2026-01-01T20:00:00Z','Asia/Shanghai')).toBe('2026-01-02');expect(dayOf('2026-01-01T20:00:00Z','UTC')).toBe('2026-01-01');});
});
describe('cache migration and per-endpoint outcome',()=>{
 it('restores v1 data but never treats a cache as a current connection',()=>{const s=storage();s.setItem(LEGACY_KEY,JSON.stringify({dev:{history:{raw:{events:[]},fetchedAt:'2026-01-01T00:00:00Z'}}}));const r=readCache(s)[0];expect(r.payload?.historyAvailable).toBe(true);expect(r.requests.history.outcome).toBe('waiting');expect(sourceState(r)).toContain('缓存');});
 it('preserves an earlier failure across reload while current request is waiting',async()=>{const s=storage(),r=await refreshReading(readCache()[0],async()=>{throw Error('offline');});writeCache([r],s);const restored=readCache(s)[0];expect(restored.requests.history.outcome).toBe('waiting');expect(restored.requests.history.lastOutcome).toBe('failed');expect(restored.errors.history).toBeTruthy();expect(sourceState(restored)).not.toContain('成功');});
 it('records endpoint success independently of another failure',async()=>{const r=await refreshReading(readCache()[0],async url=>String(url).includes('/history')?new Response('{"events":[]}'):Promise.reject(Error('offline')));expect(r.requests.history.outcome).toBe('success');expect(r.requests.status.outcome).toBe('failed');expect(sourceState(r)).toBe('部分请求失败');});
 it('uses v2 cache in preference to legacy data',()=>{const s=storage();s.setItem(LEGACY_KEY,'{}');writeCache(readCache(),s);expect(s.getItem(CACHE_KEY)).toBeTruthy();expect(readCache(s)).toHaveLength(3);});
 it('computes the remaining cooldown so a timer can wake at its end',()=>{expect(cooldownDelay(now-58000,now)).toBe(2000);expect(cooldownDelay(now-61000,now)).toBe(0);});
});
