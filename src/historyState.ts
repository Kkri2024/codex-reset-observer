import { useCallback,useEffect,useState } from 'react';
import { dayOf,formatTime,monthOf,type Event,type Kind,type Zone } from './data';
export interface Filters {q:string;type:Kind|'all';month:string;date:string;view:'list'|'calendar';tz:Zone;range:'30'|'90'|'all'}
export const defaults:Filters={q:'',type:'all',month:'all',date:'',view:'list',tz:'Asia/Shanghai',range:'90'};
const monthValid=(m:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export function validDay(d:string){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}
export function parseFilters(search:string):Filters{
 const p=new URLSearchParams(search),m=p.get('month')||'all',d=p.get('date')||'',type=p.get('type')||'all';
 const date=validDay(d)?d:'';
 return {q:p.get('q')||'',type:['global','banked','signal'].includes(type)?type as Kind:'all',month:date?date.slice(0,7):monthValid(m)?m:'all',date,view:p.get('view')==='calendar'?'calendar':'list',tz:p.get('tz')==='UTC'?'UTC':'Asia/Shanghai',range:['30','all'].includes(p.get('range')||'')?p.get('range') as '30'|'all':'90'};
}
export function serializeFilters(f:Filters,search=''){
 const p=new URLSearchParams(search);
 for(const key of Object.keys(defaults) as (keyof Filters)[]){if(f[key]===defaults[key])p.delete(key);else p.set(key,f[key]);}
 return p.toString();
}
export function useFilters(){
 const [state,setState]=useState(()=>parseFilters(window.location.search));
 useEffect(()=>{const pop=()=>setState(parseFilters(window.location.search));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const update=useCallback((patch:Partial<Filters>,replace=false)=>{
   // Read the URL synchronously so back/forward and rapid changes share one source of truth.
   const next={...parseFilters(window.location.search),...patch};const url=new URL(window.location.href);url.search=serializeFilters(next,url.search);
   if(url.href!==window.location.href)window.history[replace?'replaceState':'pushState'](null,'',url);
   setState(next);
 },[]);
 return [state,update] as const;
}
export function filterEvents(events:Event[],f:Filters,ignoreDate=false){
 const q=f.q.trim().toLocaleLowerCase('zh-CN');
 return events.filter(e=>(f.type==='all'||e.kind===f.type)&&(f.month==='all'||monthOf(e,f.tz)===f.month)&&(ignoreDate||!f.date||dayOf(e.at,f.tz,e.dayOnly)===f.date)&&(!q||[e.title,e.evidence,e.scope].join(' ').toLocaleLowerCase('zh-CN').includes(q)));
}
export function shiftMonth(month:string,delta:number){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
const names:Record<string,string>={dev:'Codex Reset · dev',ai:'Codex Reset · ai',app:'Codex Reset · app'};
const kinds={global:'公共额度重置',banked:'赠送重置次数',signal:'待确认消息'};
export function csvCell(value:string){const safe=/^[\s]*[=+\-@]|^[\t\r\n]/.test(value)?`'${value}`:value;return `"${safe.replaceAll('"','""')}"`;}
export function exportCsv(events:Event[],zone:Zone){
 const rows=[['类型',`记录时间（${zone}）`,'原始时间','时间精度','时间依据','标题','适用范围','公告摘录','原始链接','收录来源','冲突标识'],...events.map(e=>[kinds[e.kind],formatTime(e.at,zone,e.dayOnly),e.at,e.dayOnly?'仅日期':'时分',e.timeBasis||'未说明',e.title,e.scope,e.evidence,e.url,e.origins.map(s=>names[s]||s).join('；'),e.conflict?'存在差异':'无'])];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
