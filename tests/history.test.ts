import {describe,it,expect} from 'vitest';
import {defaults,exportCsv,filterEvents,parseFilters,serializeFilters,shiftMonth,validDay} from '../src/historyState';
import {rangedIntervalStats,type Event} from '../src/data';
const e=(patch:Partial<Event>={}):Event=>({id:'test',at:'2026-01-31T20:00:00Z',dayOnly:false,title:'测试公告',kind:'global',scope:'Plus 与 Pro',status:'recorded',evidence:'原始公告中的重要消息',url:'https://x.com/test/status/1',origins:['dev'],...patch});
describe('history search and URL state',()=>{
 it('searches title, evidence and scope',()=>{for(const q of ['测试','重要消息','plus'])expect(filterEvents([e()],{...defaults,q})).toHaveLength(1);});
 it('combines search, kind, month and date',()=>{const f={...defaults,q:'Pro',type:'global' as const,month:'2026-02',date:'2026-02-01'};expect(filterEvents([e(),e({kind:'banked'})],f)).toHaveLength(1);});
 it('calendar grouping respects timezone across midnight',()=>{expect(filterEvents([e()],{...defaults,date:'2026-02-01'})).toHaveLength(1);expect(filterEvents([e()],{...defaults,tz:'UTC',date:'2026-02-01'})).toHaveLength(0);});
 it('keeps date-only source records on the original date',()=>expect(filterEvents([e({at:'2026-01-31',dayOnly:true})],{...defaults,date:'2026-01-31'})).toHaveLength(1));
 it('ignores selected day when computing calendar counts',()=>expect(filterEvents([e()],{...defaults,date:'2026-02-02'},true)).toHaveLength(1));
 it('round trips all filter state without losing unrelated parameters',()=>{const f={...defaults,q:'Plus & Pro',type:'banked' as const,month:'2026-02',date:'2026-02-01',view:'calendar' as const,tz:'UTC' as const,range:'30' as const};const query=serializeFilters(f,'other=keep');expect(parseFilters(query)).toEqual(f);expect(query).toContain('other=keep');});
 it('falls back safely for invalid URL fields',()=>expect(parseFilters('?type=bad&month=2026-19&date=2026-02-31&tz=wrong&range=7&view=bad')).toEqual(defaults));
 it('selected date establishes its month',()=>expect(parseFilters('?month=2025-01&date=2026-02-01').month).toBe('2026-02'));
 it('cleared filters retain timezone and view',()=>{const f=parseFilters(serializeFilters({...defaults,tz:'UTC',view:'calendar'}));expect(f.tz).toBe('UTC');expect(f.view).toBe('calendar');expect(f.q).toBe('');});
 it('moves calendar months across year and leap boundaries',()=>{expect(shiftMonth('2026-01',-1)).toBe('2025-12');expect(shiftMonth('2025-12',1)).toBe('2026-01');expect(validDay('2024-02-29')).toBe(true);expect(validDay('2026-02-29')).toBe(false);});
});
describe('CSV export',()=>{
 it('exports all filtered records, not the displayed first page',()=>{const text=exportCsv(Array.from({length:32},(_,i)=>e({id:String(i)})),'UTC');expect(text.match(/^"公共额度重置"/gm)).toHaveLength(32);expect(text.charCodeAt(0)).toBe(0xfeff);});
 it('quotes Chinese, commas, quotes and newlines correctly',()=>{expect(exportCsv([e({title:'中文,"标题"\n第二行'})],'UTC')).toContain('"中文,""标题""\n第二行"');});
 it('neutralizes spreadsheet formulas including whitespace prefixes',()=>{for(const title of ['=HYPERLINK("x")',' +SUM(1,2)','-1+1','@cmd','\t=1']){const csv=exportCsv([e({title})],'UTC');expect(csv).toContain(`"'${title.replaceAll('"','""')}"`);}});
 it('retains original link, precision, sources and conflict mark',()=>{const csv=exportCsv([e({dayOnly:true,at:'2026-01-31',conflict:true,origins:['dev','app']})],'Asia/Shanghai');expect(csv).toContain('仅日期');expect(csv).toContain('存在差异');expect(csv).toContain('Codex Reset · app');expect(csv).toContain('https://x.com/test/status/1');});
});
describe('consistent interval ranges',()=>{
 const now=Date.parse('2026-04-01T00:00:00Z');
 it('excludes a gap that crosses the selected range boundary',()=>{const stats=rangedIntervalStats([e({at:'2026-02-01'}),e({at:'2026-03-20'}),e({at:'2026-03-25'})],'30',now);expect(stats.gaps).toHaveLength(1);expect(stats.median).toBe(5);});
 it('includes events exactly on the boundary and counts every plotted gap',()=>{const at=new Date(now-30*86400000).toISOString();const stats=rangedIntervalStats([e({at}),e({at:'2026-03-20'}),e({at:'2026-03-25'})],'30',now);expect(stats.gaps).toHaveLength(2);expect(stats.count).toBe(3);});
 it('keeps different statistics ranges independent of the history text filter',()=>{const events=[e({at:'2026-01-10'}),e({at:'2026-03-20'}),e({at:'2026-03-25'})];expect(rangedIntervalStats(events,'90',now).gaps).toHaveLength(2);expect(rangedIntervalStats(events,'30',now).gaps).toHaveLength(1);});
 it('preserves exclusion rules within the selected range',()=>{const stats=rangedIntervalStats([e({at:'2026-03-20'}),e({at:'2026-03-21',kind:'banked'}),e({at:'2026-03-22',dayOnly:true}),e({at:'2026-03-23',conflict:true})],'all',now);expect(stats.gaps).toHaveLength(0);});
});
