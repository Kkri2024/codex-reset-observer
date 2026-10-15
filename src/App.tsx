import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowDown, ArrowUpRight, ChevronDown, Clock3, Database, Gift, Globe2, Info, Radio, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { formatTime, intervalStats, isStale, mergeEvents, monthOf, SOURCES, type Event, type Kind, type Zone } from './data';
import { ATTEMPT_KEY, lastAttempt, readCache, refreshReading, storageOrUndefined, writeCache } from './store';

const names = Object.fromEntries(SOURCES.map(s=>[s.id,s.name]));
const labels: Record<Kind,string> = { global:'公共额度重置', banked:'赠送重置次数', signal:'待确认消息' };
function Out({ href, children, ...props }: { href: string; children: ReactNode; className?: string }) { return href ? <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}<ArrowUpRight size={14} aria-hidden="true"/></a> : null; }
function Tag({ kind }: { kind: Kind }) { return <span className={`tag ${kind}`}>{kind==='banked'?<Gift size={12}/>:kind==='signal'?<Radio size={12}/>:<RotateCcw size={12}/>} {labels[kind]}</span>; }
function Empty({ children }: { children:ReactNode }) { return <div className="empty"><Database size={24} aria-hidden="true"/><p>{children}</p></div>; }
export default function App() {
  const storage = useMemo(storageOrUndefined,[]);
  const [readings,setReadings] = useState(()=>readCache(storage));
  const ref = useRef(readings), busy = useRef(false), attempted = useRef(lastAttempt(storage));
  const [loading,setLoading] = useState(false), [now,setNow] = useState(Date.now()), [zone,setZone] = useState<Zone>('Asia/Shanghai');
  const [kind,setKind] = useState<Kind|'all'>('all'), [month,setMonth] = useState('all'), [limit,setLimit] = useState(15);
  const [cacheWarning,setCacheWarning] = useState(false);
  const refresh = useCallback(async () => {
    if (busy.current || Date.now()-attempted.current<60000) return;
    busy.current=true; attempted.current=Date.now(); setNow(Date.now()); setLoading(true);
    try { storage?.setItem(ATTEMPT_KEY,String(attempted.current)); } catch { setCacheWarning(true); }
    // Each source finishes independently, so a slow source cannot hide successful results.
    await Promise.all(ref.current.map(async reading=>{
      const next = await refreshReading(reading);
      ref.current=ref.current.map(r=>r.source.id===next.source.id?next:r);
      setReadings([...ref.current]);
      if (!writeCache(ref.current,storage)) setCacheWarning(true);
    }));
    busy.current=false; setLoading(false); setNow(Date.now());
  },[storage]);
  useEffect(()=>{
    void refresh();
    const tick=setInterval(()=>setNow(Date.now()),1000);
    const poll=setInterval(()=>{ if(document.visibilityState==='visible') void refresh(); },300000);
    const visible=()=>{ if(document.visibilityState==='visible' && Date.now()-attempted.current>=300000) void refresh(); };
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(tick);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  const events = useMemo(()=>mergeEvents(readings.flatMap(r=>r.payload?.events??[])),[readings]);
  const stats = useMemo(()=>intervalStats(events),[events]);
  const latest=events.find(e=>e.kind==='global'), banked=events.find(e=>e.kind==='banked');
  const months=[...new Set(events.map(e=>monthOf(e,zone)))].sort().reverse();
  const filtered=events.filter(e=>(kind==='all'||e.kind===kind)&&(month==='all'||monthOf(e,zone)===month));
  const remaining=Math.max(0,Math.ceil((60000-(now-attempted.current))/1000));
  const available=readings.filter(r=>r.payload).length;
  const conflict=events.some(e=>e.conflict);
  const resetCount=events.filter(e=>e.kind==='global'&&!e.conflict).length;
  const grants=events.filter(e=>e.kind==='banked'&&!e.conflict).length;
  const historyAvailable=!!readings[0].payload?.historyAvailable;
  const latestSourceTime=latest ? readings.find(r=>r.source.id===latest.origins[0])?.payload?.updated??null : null;
  const lastFetch = Math.max(0,...readings.flatMap(r=>Object.values(r.parts).map(p=>Date.parse(p.fetchedAt))));
  const p24s = readings.flatMap(r=>r.payload?.forecast?.p24==null?[]:[r.payload.forecast.p24]);
  const forecastDifference=p24s.length>1 && Math.max(...p24s)-Math.min(...p24s)>=20;
  const statusText=loading?'正在读取公开来源':available===0?'来源暂不可用':available<SOURCES.length?'部分来源可用':'公开来源已连接';

  function LatestEvent({event}: {event:Event}) { return <>
    <h3>{event.title}</h3><p className="event-time">{formatTime(event.at,zone,event.dayOnly)}</p>
    <p className="subtle">{event.scope}</p>
    {event.conflict&&<p className="warning">来源对这条公告的时间或分类存在差异，请查看历史记录。</p>}
    <div className="event-source">{event.origins.map(id=><span key={id}>{names[id]}</span>)}<Out href={event.url}>查看原始公告</Out></div>
    <p className="event-update">来源更新：{formatTime(readings.find(r=>r.source.id===event.origins[0])?.payload?.updated??null,zone)}</p>
  </>; }

  return <>
    <a className="skip" href="#main">跳到主要内容</a>
    <header className="site-header"><a className="brand" href="#"><span className="brand-icon"><Activity size={21}/></span><span>Codex <strong>重置观察站</strong></span></a><nav aria-label="主要导航"><a href="#forecast">重置估算</a><a href="#history">历史记录</a><a href="#sources">数据来源</a></nav><span className="independent">独立观察 · 非官方</span></header>
    <main id="main">
      <div className="intro"><div><div className="eyebrow"><span className="live-dot"/> PUBLIC RESET OBSERVATORY</div><h1>每一次重置，<br className="mobile-break"/>都有迹可循。</h1><p>追踪公共额度重置，记录历史，比较下一次的可能性。</p></div><div className="intro-controls"><label className="zone"><Globe2 size={15}/><span className="sr-only">显示时区</span><select value={zone} onChange={e=>{setZone(e.target.value as Zone);setMonth('all');setLimit(15);}}><option value="Asia/Shanghai">北京时间 UTC+8</option><option value="UTC">协调世界时 UTC</option></select></label><button className="refresh" disabled={loading||remaining>0} onClick={()=>void refresh()}><RefreshCw size={15} className={loading?'spin':''}/>{loading?'刷新中':remaining>0?`${remaining} 秒后可刷新`:'刷新数据'}</button></div></div>

      <div className="connection" role="status"><span className={`status-dot ${available===0?'muted':''}`}/><span>{statusText}</span><span className="connection-time">{lastFetch?`最近读取 ${formatTime(new Date(lastFetch).toISOString(),zone)}`:'尚未成功读取数据'} · 页面可见时每 5 分钟刷新</span></div>
      {cacheWarning&&<p className="notice"><Info size={16}/>浏览器未允许保存缓存，当前数据仍可查看。</p>}
      <section className="latest-section" aria-labelledby="latest-title">
        <div className="latest-main"><div className="section-label"><RotateCcw size={16}/><h2 id="latest-title">最近一次公共额度重置</h2><span className="tag neutral">第三方记录</span></div>{latest?<LatestEvent event={latest}/>:<Empty>{loading?'正在查找最近的重置记录…':'暂时无法取得最近的公共重置记录。请稍后刷新，或前往下方数据来源查看。'}</Empty>}<div className="latest-note"><Info size={14}/><span>公共公告不代表每个账户均已恢复。请在 Codex 中确认自己的额度。</span></div></div>
        <aside className="latest-aside"><div className="section-label"><Gift size={16}/><h2>最近赠送重置次数</h2></div>{banked?<LatestEvent event={banked}/>:<p className="aside-empty">{loading?'正在读取赠送记录…':'暂无可用的赠送记录'}</p>}<p className="aside-note">赠送的重置次数需要自行使用，与直接恢复额度不同。</p></aside>
      </section>

      <section className="forecast-section" id="forecast" aria-labelledby="forecast-title"><div className="section-heading"><div><div className="eyebrow">LOOKING AHEAD</div><h2 id="forecast-title">下一次，会在什么时候？</h2></div><span className="outline-label">第三方估算 · 非官方预告</span></div><p className="section-description">各来源独立计算，保留差异。概率是参考，不是时间表。</p>
        {forecastDifference&&<p className="notice"><TriangleAlert size={16}/>来源之间的估算差异较大，请结合数据时间与计算方法阅读。</p>}
        <div className="forecast-grid">{readings.map(r=>{
          const f=r.payload?.forecast, stale=!!f&&isStale(f.at,now), failed=!!r.errors[r.source.id==='app'?'signal':'forecast'], noEstimate=!!f&&f.p24===null&&f.p48===null;
          return <article className="forecast-item" key={r.source.id}><div className="forecast-top"><Out href={r.source.home}>{r.source.name}</Out><span className={`tiny-status ${!f||failed||stale?'aged':''}`}>{!f?'暂不可用':noEstimate?'暂无估算':failed?'缓存':stale?'数据已过期':'已读取'}</span></div>
          <div className="probabilities">{[['未来 24 小时',f?.p24],['未来 48 小时',f?.p48]].map(([label,value])=><div key={String(label)}><p>{label}</p><div className="probability">{typeof value==='number'?<>{value}<small>%</small></>:<span className="no-value">—</span>}</div><div className="probability-track"><div style={{width:typeof value==='number'?`${value}%`:'0'}}/></div></div>)}</div>
          <p className="forecast-time"><Clock3 size={12}/>{f?formatTime(f.at,zone):'尚无可用估算'}</p>
          <details><summary>计算说明与样本<ChevronDown size={13}/></summary><p>{f?.method||'来源暂未提供可用估算，空值不代表概率为零。'}</p>{f?.sample!=null&&<p>来源报告的样本／回测数量：{f.sample}</p>}<Out href={f?.methodUrl||r.source.home}>阅读来源说明</Out></details></article>;
        })}</div>
      </section>

      <section className="interval-section" aria-labelledby="interval-title"><div className="interval-copy"><div className="eyebrow">THE RHYTHM SO FAR</div><h2 id="interval-title">回看重置的间隔</h2><p>历史记录中的节奏，<br/>不构成未来重置的承诺。</p><div className="stat-row"><div><strong>{stats.median===null?'—':stats.median.toFixed(1)}<small>天</small></strong><span>间隔中位数</span></div><div><strong>{stats.gaps.length}<small>组</small></strong><span>有效间隔样本</span></div></div></div>
        <div className="chart-area">{stats.gaps.length?<><div className="chart-caption"><span>最近 {Math.min(stats.gaps.length,24)} 组公共重置间隔</span><span>单位：天</span></div><div className="bar-chart" role="img" aria-label={`公共重置间隔图，共 ${stats.gaps.length} 组样本，中位数 ${stats.median?.toFixed(1)} 天`}>
          {stats.gaps.slice(-24).map((g,i)=><div className="bar-slot" key={g.at}><div className="bar" style={{height:`${Math.max(3,g.days/Math.max(...stats.gaps.slice(-24).map(x=>x.days))*100)}%`}} title={`${formatTime(g.at,zone)} · 间隔 ${g.days.toFixed(1)} 天`}><span>{g.days.toFixed(1)}</span></div>{i%4===0&&<small>{formatTime(g.at,zone).slice(5,10)}</small>}</div>)}
        </div><details className="interval-details"><summary>查看间隔数据表<ChevronDown size={13}/></summary><table><caption className="sr-only">公共重置间隔</caption><thead><tr><th>后一次记录时间</th><th>间隔（天）</th></tr></thead><tbody>{stats.gaps.map(g=><tr key={g.at}><td>{formatTime(g.at,zone)}</td><td>{g.days.toFixed(2)}</td></tr>)}</tbody></table></details></>:<Empty>至少需要两条时间明确、无来源冲突的公共重置记录，才能计算间隔。</Empty>}<p className="chart-footnote">按公告／观察记录计算；排除赠送次数、待确认消息、仅日期及冲突记录。历史可能有缺漏。</p></div>
      </section>

      <section id="history" className="history-section" aria-labelledby="history-title"><div className="section-heading"><div><div className="eyebrow">THE PUBLIC RECORD</div><h2 id="history-title">重置历史</h2></div><span className="history-total">{resetCount} 条公共重置 · {grants} 条赠送记录</span></div>
      <div className="history-toolbar"><div className="tabs" role="group" aria-label="按事件类型筛选">{(['all','global','banked','signal'] as const).map(k=><button aria-pressed={kind===k} className={kind===k?'active':''} key={k} onClick={()=>{setKind(k);setLimit(15);}}>{k==='all'?'全部':k==='global'?'额度重置':k==='banked'?'赠送次数':'待确认'}</button>)}</div><label className="month-select"><span className="sr-only">按月份筛选</span><select value={month} onChange={e=>{setMonth(e.target.value);setLimit(15);}}><option value="all">所有月份</option>{months.map(m=><option key={m} value={m}>{m.replace('-',' 年 ')} 月</option>)}</select></label></div>
      {!historyAvailable&&<p className="notice"><Info size={16}/>主历史接口尚未取得数据。当前仅展示其他来源可用的零散记录，不代表完整历史。</p>}
      {conflict&&<p className="notice"><TriangleAlert size={16}/>部分原始公告存在不同时间或分类，已标记并保留各版本。</p>}
      <div className="history-list">{filtered.length?filtered.slice(0,limit).map((e,i)=><article className="history-row" key={`${e.id}:${e.at}:${i}`}><div className="history-date"><time dateTime={e.at}>{formatTime(e.at,zone,e.dayOnly)}</time><span>{e.dayOnly?'原始日期，未换算时区':e.timeBasis==='observation'?'上游观察时间':e.timeBasis==='announcement'?'公告发布时间':'来源记录时间'}</span></div><div className="history-content"><div className="history-tags"><Tag kind={e.kind}/><span className="source-record">{e.kind==='signal'?'尚未确认':'来源收录'}</span>{e.conflict&&<span className="conflict-tag">来源有差异</span>}</div><h3>{e.title}</h3><p>{e.scope}</p><details><summary>记录详情<ChevronDown size={13}/></summary><p className="evidence">{e.evidence||'来源未附公告摘录，请查看原始链接。'}</p><p>收录来源：{e.origins.map(id=>names[id]).join('、')}。本站未独立核验。</p></details></div><div className="history-link">{e.url?<Out href={e.url}>原始来源</Out>:<span>原始链接未提供</span>}</div></article>):<Empty>{loading?'正在读取历史记录…':events.length?'当前筛选条件下没有收录记录，请调整类型或月份。':'历史记录暂不可用。可稍后刷新或打开来源网站查看。'}</Empty>}</div>
      {filtered.length>limit&&<button className="load-more" onClick={()=>setLimit(n=>n+15)}>再显示 15 条<ArrowDown size={14}/></button>}
      <p className="history-note">{events.length?`当前可见数据覆盖 ${formatTime(events[events.length-1].at,zone,events[events.length-1].dayOnly)} 至 ${formatTime(events[0].at,zone,events[0].dayOnly)}。`:''}记录可能缺漏；未收录不代表未发生。公告时间也不等于每个账户的恢复时间。</p>
      </section>

      <section id="sources" className="sources-section" aria-labelledby="sources-title"><div className="section-heading"><div><div className="eyebrow">TRACEABLE BY DESIGN</div><h2 id="sources-title">每条信息，都保留出处</h2></div><Database size={22} aria-hidden="true"/></div><p className="section-description">只读取公开资料，不连接你的 Codex 账户。各来源可能共用上游，数量不代表独立核验次数。</p>
      <div className="source-list">{readings.map(r=>{
        const errors=Object.entries(r.errors), fetches=Object.values(r.parts), checked=fetches.length?Math.max(...fetches.map(p=>Date.parse(p.fetchedAt))):0;
        return <article className="source-row" key={r.source.id}><div><Out href={r.source.home}>{r.source.name}</Out><p>{r.source.id==='dev'?'历史 · 最新动态 · 预测':r.source.id==='ai'?'历史频率估算 · 上游 whenreset.app':'公开信号估算 · 最新事件'}</p></div><div className="source-times"><span>来源数据：{formatTime(r.payload?.updated??null,zone)}</span><span>本机读取：{checked?formatTime(new Date(checked).toISOString(),zone):'尚未成功'}</span></div><div className="source-state"><span className={`tiny-status ${errors.length||!r.payload?'aged':''}`}>{loading&&!r.payload?'读取中':!r.payload?'暂不可用':errors.length?'部分失败／缓存':isStale(r.payload.updated,now)?'来源数据已过期':'可用'}</span>{errors.length>0&&<details><summary>查看原因<ChevronDown size={12}/></summary><p>{errors.map(([k,v])=>`${{status:'状态',history:'历史',forecast:'预测',signal:'事件'}[k]||k}：${v}`).join('；')}</p></details>}</div></article>;
      })}</div><div className="source-explanation"><Info size={16}/><p>“来源数据”是上游报告的时间，“本机读取”是浏览器成功取得数据的时间。读取成功不意味着数据新鲜，第三方预测也不意味着官方即将重置。</p></div></section>
      <footer><div className="footer-brand"><Activity size={17}/>Codex 重置观察站</div><p>独立第三方工具，与 OpenAI 无隶属关系。个人额度请以 Codex 显示为准。</p><a href="#main">回到顶部 ↑</a></footer>
    </main>
  </>;
}
