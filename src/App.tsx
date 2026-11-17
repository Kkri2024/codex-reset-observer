import { PublicUpdates, ForecastEvidence } from './PublicUpdates';
import { PUBLIC_ID } from './publicEvidence';
import { useMemo } from 'react';
import { Activity,ArrowUpRight,ChevronDown,RefreshCw } from 'lucide-react';
import { formatTime,mergeEvents,type Zone } from './data';
import { sourceState,type Reading } from './store';
import { useReadings } from './useReadings';
import { History } from './History';
import { Stats } from './Stats';
import {useFilters} from './historyState';
const requestLabels:Record<string,string>={status:'最新状态',history:'历史记录',forecast:'预测',signal:'公开信号',feed:'Tibo 动态',timeline:'公共重置时间线',audit:'预测回测依据'};
function Out({href,children}:{href:string;children:React.ReactNode}){return href?<a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14} aria-hidden="true"/></a>:null;}
export default function App(){
  const {readings,loading,now,cacheWarning,refresh,remaining}=useReadings();
  const [filters,setFilters]=useFilters(),zone=filters.tz;
  const events=useMemo(()=>mergeEvents(readings.flatMap(r=>r.payload?.events??[])),[readings]);
  const main=readings[0], publicReading=readings.find(r=>r.source.id===PUBLIC_ID)!;
  const lastFetch=Math.max(0,...readings.flatMap(r=>Object.values(r.parts).map(p=>Date.parse(p.fetchedAt))));
  return <><a className="skip" href="#main">跳到主要内容</a><header className="site-header"><a className="brand" href="#main"><span className="brand-icon"><Activity size={20} aria-hidden="true"/></span>Codex 重置观察站</a><nav aria-label="主要导航"><a href="#tibo">Tibo 动态</a><a href="#history">历史记录</a><a href="#sources">数据来源</a></nav><div className="header-controls"><label className="zone"><span className="sr-only">显示时区</span><select value={zone} onChange={e=>setFilters({tz:e.target.value as Zone})}><option value="Asia/Shanghai">北京时间 UTC+8</option><option value="UTC">协调世界时 UTC</option></select></label><button className="primary" disabled={loading||remaining>0} onClick={()=>void refresh()}><RefreshCw size={15} className={loading?'spin':''} aria-hidden="true"/>{loading?'刷新中…':remaining>0?`${remaining} 秒后可刷新`:'刷新数据'}</button></div></header><main id="main">
    <PublicUpdates reading={publicReading} legacy={events} zone={zone} now={now}/>
    {cacheWarning&&<p className="notice">浏览器未允许保存缓存，当前数据仍可查看。</p>}
    <ForecastEvidence reading={publicReading} legacy={readings.filter(r=>r.source.id!==PUBLIC_ID)} zone={zone} now={now}/>
    <History events={events} filters={filters} onChange={setFilters} available={main.requests.history?.outcome==='success'}/>
    <Stats events={events} zone={zone} range={filters.range} onRange={range=>setFilters({range})} now={now}/>
    <section id="sources" aria-labelledby="sources-title"><div className="section-head"><h2 id="sources-title">数据来源</h2><span className="meta" role="status">{loading?'正在请求…':lastFetch?`最近读取 ${formatTime(new Date(lastFetch).toISOString(),zone)}`:'尚未成功读取'}</span></div><p className="section-description">只读取公开资料。来源可能共用上游，不等于多次独立核验。</p>{readings.map(r=><SourceRow key={r.source.id} r={r} zone={zone}/>)}<p className="footnote">本机读取、上游更新和预测基准是不同时间；页面可见时每 5 分钟刷新。关闭页面后不采集。</p></section>
    <footer><span><Activity size={16} aria-hidden="true"/>Codex 重置观察站</span><p>独立第三方工具，与 OpenAI 无隶属关系。</p><a href="#main">回到顶部 ↑</a></footer>
  </main></>;
}
function SourceRow({r,zone}:{r:Reading;zone:Zone}){return <details className="source-row"><summary><span>{r.source.name}</span><span className="state">{sourceState(r)}</span><ChevronDown size={14} aria-hidden="true"/></summary><div className="source-expanded"><Out href={r.source.home}>打开来源网站</Out><p>上游数据更新：{formatTime(r.payload?.updated??null,zone)}</p>{r.source.endpoints.map(ep=><div className="endpoint" key={ep.part}><strong>{requestLabels[ep.part]}</strong><span>{r.requests[ep.part]?.outcome==='success'?'本次连接成功':r.requests[ep.part]?.outcome==='failed'?'本次请求失败':r.parts[ep.part]?'本机缓存／等待更新':'等待更新'}</span><p>最近成功：{formatTime(r.parts[ep.part]?.fetchedAt??null,zone)}</p>{r.requests[ep.part]?.outcome==='failed'&&r.parts[ep.part]&&<p>显示本机缓存</p>}{r.requests[ep.part]?.error&&<p className="warning">{r.requests[ep.part].error}。可稍后刷新或查看来源网站。</p>}</div>)}</div></details>;}
