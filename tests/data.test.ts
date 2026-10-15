import { describe, expect, it } from 'vitest';
import { formatTime, intervalStats, isStale, mergeEvents, monthOf, normalize, percent, safeUrl, type Event } from '../src/data';

// Synthetic fixtures are test-only and never bundled in the website.
const raw = (overrides = {}) => ({ id:'test-post', type:'global_reset', announced_at:'2026-01-01T00:00:00Z', source_url:'https://x.com/test/status/123', status:'recorded', title:'测试公告', ...overrides });
const e = (overrides: Partial<Event> = {}): Event => ({ id:'test',at:'2026-01-01T00:00:00Z',dayOnly:false,title:'测试',kind:'global',scope:'测试',status:'recorded',evidence:'',url:'',origins:['dev'],...overrides });
describe('source adapters',()=>{
  it('reads real dev event field names, including observation-only times',()=>{
    const p=normalize('dev',{history:{events:[raw(),raw({id:'observed',announced_at:null,effective_at:'2026-01-02T00:00:00Z',time_basis:'observation',type:'banked_reset'})],coverage:'partial'}});
    expect(p.events).toHaveLength(2); expect(p.events[1].kind).toBe('banked'); expect(p.events[1].timeBasis).toBe('observation'); expect(p.historyAvailable).toBe(true);
  });
  it('accepts an empty but valid history archive',()=>expect(normalize('dev',{history:{events:[]}}).historyAvailable).toBe(true));
  it('preserves no estimate and insufficient-sample explanations',()=>{
    const f=normalize('dev',{forecast:{probability_24h:null,probability_48h:null,sample_size:0,generated_at:null,explanation:['样本不足','不发布概率']}}).forecast!;
    expect(f.p24).toBeNull();expect(f.at).toBeNull();expect(f.method).toContain('样本不足');expect(f.sample).toBe(0);
  });
  it('converts ai fractions once and preserves a genuine zero',()=>{
    const f=normalize('ai',{forecast:{available:true,probabilities:{raw_24h:0,raw_48h:0.32},source_updated_at:'2026-01-01T00:00:00Z'}}).forecast!;
    expect(f.p24).toBe(0);expect(f.p48).toBe(32);
  });
  it('supports an explicitly unavailable ai prediction without inventing data',()=>expect(()=>normalize('ai',{forecast:{available:false}})).toThrow());
  it('uses app dataAsOf instead of generatedAt for freshness',()=>{
    const p=normalize('app',{signal:{generatedAt:'2026-02-01T00:00:00Z',dataAsOf:'2026-01-01T00:00:00Z',forecast:{probability24h:77,probability48h:92},lastConfirmedReset:raw({kind:'confirmed',type:undefined,timestamp:'2026-01-01T00:00:00Z'}),recentEvents:[raw({type:undefined,kind:'signal'})]}});
    expect(p.forecast?.p24).toBe(77);expect(p.updated).toBe('2026-01-01T00:00:00Z');expect(p.events[1].kind).toBe('signal');
  });
  it('excludes future events and invalid timestamps',()=>{
    const p=normalize('dev',{history:{events:[raw({announced_at:'2099-01-01T00:00:00Z'}),raw({announced_at:'nonsense'})]}});expect(p.events).toHaveLength(0);
  });
  it('does not promote planned or unverified events into resets',()=>{
    expect(normalize('dev',{history:{events:[raw({status:'planned'})]}}).events[0].kind).toBe('signal');
  });
  it('rejects an incompatible source response',()=>expect(()=>normalize('dev',{history:{surprise:true}})).toThrow());
});
describe('public record reconciliation',()=>{
  it('deduplicates the same original announcement while retaining both sources',()=>{
    const result=mergeEvents([e({url:'https://twitter.com/test/status/123?x=1'}),e({id:'other',url:'https://x.com/test/status/123',origins:['app']})]);
    expect(result).toHaveLength(1);expect(result[0].origins).toEqual(['dev','app']);expect(result[0].conflict).toBeFalsy();
  });
  it('compares timestamps by instant, not their string representation',()=>{
    expect(mergeEvents([e({url:'https://x.com/t/status/1'}),e({url:'https://x.com/t/status/1',at:'2026-01-01T08:00:00+08:00',origins:['app']})])).toHaveLength(1);
  });
  it('retains conflicting classifications and excludes them from statistics',()=>{
    const result=mergeEvents([e({url:'https://x.com/t/status/1'}),e({url:'https://x.com/t/status/1',kind:'banked',origins:['app']})]);
    expect(result).toHaveLength(2);expect(result.every(e=>e.conflict)).toBe(true);expect(intervalStats(result).count).toBe(0);
  });
  it('retains conflicting times',()=>{
    const result=mergeEvents([e({url:'https://x.com/t/status/1'}),e({url:'https://x.com/t/status/1',at:'2026-01-02T00:00:00Z',origins:['app']})]);expect(result).toHaveLength(2);
  });
  it('does not collapse unrelated posts on the same date or generic profile links',()=>{
    expect(mergeEvents([e({id:'a',url:'https://x.com/t'}),e({id:'b',url:'https://x.com/t',origins:['app']})])).toHaveLength(2);
  });
});
describe('intervals and dates',()=>{
  it('computes median gaps with even sample count',()=>{
    const events=[e(),e({at:'2026-01-03T00:00:00Z'}),e({at:'2026-01-07T00:00:00Z'})];
    const stats=intervalStats(events);expect(stats.median).toBe(3);expect(stats.gaps).toHaveLength(2);
  });
  it('excludes banked grants, signals, date-only records and conflicts',()=>{
    const stats=intervalStats([e(),e({at:'2026-01-04',dayOnly:true}),e({kind:'banked'}),e({kind:'signal'}),e({conflict:true})]);expect(stats.median).toBeNull();expect(stats.count).toBe(1);
  });
  it('converts timezones across a month boundary for both display and filters',()=>{
    const event=e({at:'2026-01-31T20:00:00Z'});expect(monthOf(event,'Asia/Shanghai')).toBe('2026-02');expect(monthOf(event,'UTC')).toBe('2026-01');expect(formatTime(event.at,'Asia/Shanghai')).toContain('04:00');
  });
  it('does not fabricate hours or shift dates for date-only records',()=>{
    expect(formatTime('2026-01-01','Asia/Shanghai',true)).toBe('2026-01-01（仅日期）');expect(monthOf(e({at:'2026-01-31',dayOnly:true}),'Asia/Shanghai')).toBe('2026-01');
  });
  it('treats unknown, old and future timestamps as unreliable',()=>{
    const now=Date.parse('2026-01-01T01:00:00Z');expect(isStale(null,now)).toBe(true);expect(isStale('2026-01-01T00:00:00Z',now)).toBe(true);expect(isStale('2026-01-01T00:59:00Z',now)).toBe(false);expect(isStale('2026-01-02T00:00:00Z',now)).toBe(true);
  });
  it('rejects malicious links and invalid percentages',()=>{
    expect(safeUrl('javascript:alert(1)')).toBe('');expect(percent(null)).toBeNull();expect(percent('55')).toBeNull();expect(percent(102)).toBeNull();expect(percent(-1)).toBeNull();
  });
});
