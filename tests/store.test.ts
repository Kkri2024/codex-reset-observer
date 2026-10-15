import { describe, expect, it, vi } from 'vitest';
import { ATTEMPT_KEY, CACHE_KEY, fetchJson, lastAttempt, readCache, refreshReading, writeCache } from '../src/store';
const storage=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};
const good={available:true,probabilities:{raw_24h:0.2,raw_48h:null},source_updated_at:'2026-01-01T00:00:00Z'};
const response=(v:unknown)=>Promise.resolve(new Response(JSON.stringify(v),{status:200}));
describe('cache and network resilience',()=>{
  it('loads without local storage',()=>expect(readCache()).toHaveLength(3));
  it('ignores corrupt cache',()=>{const s=storage();s.setItem(CACHE_KEY,'bad');expect(readCache(s).every(r=>!r.payload)).toBe(true);});
  it('tolerates blocked local storage',()=>{const s={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};expect(readCache(s)).toHaveLength(3);expect(writeCache(readCache(),s)).toBe(false);});
  it('caches successful data and restores it across reload',async()=>{
    const s=storage(), r=await refreshReading(readCache()[1],vi.fn(()=>response(good)));writeCache([r],s);const restored=readCache(s)[1];expect(restored.cached).toBe(true);expect(restored.payload?.forecast?.p24).toBe(20);
  });
  it('preserves last good data on network failure',async()=>{
    const r=await refreshReading(readCache()[1],vi.fn(()=>response(good)));
    const next=await refreshReading(r,vi.fn(()=>Promise.reject(new TypeError('Failed to fetch'))));expect(next.cached).toBe(true);expect(next.payload?.forecast?.p24).toBe(20);expect(next.errors.forecast).toContain('连接失败');
  });
  it('does not overwrite good data with incompatible schema',async()=>{
    const r=await refreshReading(readCache()[1],vi.fn(()=>response(good)));
    const next=await refreshReading(r,vi.fn(()=>response({html:'blocked'})));expect(next.payload?.forecast?.p24).toBe(20);expect(next.errors.forecast).toContain('格式');
  });
  it('permits one endpoint to succeed while others fail',async()=>{
    const mock=vi.fn((url:RequestInfo|URL)=>String(url).includes('/history')?response({events:[]}):Promise.reject(Error('offline')));
    const r=await refreshReading(readCache()[0],mock);expect(r.payload?.historyAvailable).toBe(true);expect(Object.keys(r.errors)).toHaveLength(2);
  });
  it('handles all sources being unavailable without invented data',async()=>{
    const result=await Promise.all(readCache().map(r=>refreshReading(r,vi.fn(()=>Promise.reject(Error('offline'))))));expect(result.every(r=>r.payload===null)).toBe(true);
  });
  it('reports HTTP failures',async()=>{await expect(fetchJson('https://example.com',vi.fn(()=>Promise.resolve(new Response('',{status:403}))))).rejects.toThrow('HTTP 403');});
  it('reports non-JSON responses',async()=>{await expect(fetchJson('https://example.com',vi.fn(()=>Promise.resolve(new Response('<html>blocked</html>'))))).rejects.toThrow('非 JSON');});
  it('aborts requests that exceed timeout',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));}));
    const p=expect(fetchJson('https://example.com',mock,50)).rejects.toThrow('请求超时');await vi.advanceTimersByTimeAsync(51);await p;vi.useRealTimers();
  });
  it('retains refresh cooldown across page reload',()=>{const s=storage();const n=Date.now();s.setItem(ATTEMPT_KEY,String(n));expect(lastAttempt(s)).toBe(n);});
});
