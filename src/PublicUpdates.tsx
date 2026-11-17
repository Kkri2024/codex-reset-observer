import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { formatTime, type Event, type Zone } from './data';
import { advanceAlerts, normalizeAudit, normalizeFeed, normalizeTimeline, PUBLIC_HOME, publicStale, type AlertCursor, type PublicRecord } from './publicEvidence';
import type { Reading } from './store';

function Link({href,children}:{href:string;children:React.ReactNode}) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRight size={14} aria-hidden="true"/></a>;
}
function Credit() { return <p className="footnote">数据来源：<Link href={PUBLIC_HOME}>codex-reset.com</Link> · 第三方收录，本站未独立核验 X 原帖。</p>; }
function readPart<T>(raw:unknown, parse:(raw:unknown)=>T):T|null { try { return parse(raw); } catch { return null; } }
function PartState({reading,part,updated,stale,zone}:{reading:Reading;part:string;updated:string|null;stale:boolean;zone:Zone}) {
  const request=reading.requests[part], fetched=reading.parts[part]?.fetchedAt;
  const state=request?.outcome==='failed'?(fetched?'读取失败 · 本机缓存':'读取失败'):
    request?.outcome==='success'?(stale?'已连接 · 来源数据过期或时间异常':'本次读取成功'):
    fetched?'本机缓存 · 等待更新':'等待更新';
  return <p className="meta public-source-state">{state}{request?.error&&` · ${request.error}`} · 上游更新：{formatTime(updated,zone)} · 本机最近成功：{formatTime(fetched??null,zone)}</p>;
}
function recordName(record:PublicRecord) {
  if(record.status==='observed') return record.kind==='banked'?'第三方观察到赠送次数':'第三方观察到公共重置';
  if(record.status==='announced') return record.kind==='banked'?'赠送次数公告':'公共重置公告';
  return record.kind==='banked'?'赠送次数相关记录':'公共重置相关记录';
}
export function PublicUpdates({reading,legacy,zone,now}:{reading:Reading;legacy:Event[];zone:Zone;now:number}) {
  const feedRaw=reading.parts.feed?.raw,timelineRaw=reading.parts.timeline?.raw;
  const feed=useMemo(()=>readPart(feedRaw,normalizeFeed),[feedRaw]);
  const timeline=useMemo(()=>readPart(timelineRaw,normalizeTimeline),[timelineRaw]);
  const timelineStale=!timeline||publicStale(timeline.updated,now);
  const feedStale=!feed||feed.stale||publicStale(feed.updated,now);
  const feedCurrent=!feedStale&&reading.requests.feed?.outcome==='success';
  const openedAt=useRef(Date.now()), cursor=useRef<AlertCursor|null>(null), [unread,setUnread]=useState(0);
  useEffect(()=>{
    if (!feed || !feedCurrent || feed.inconsistent || document.visibilityState!=='visible') return;
    const next=advanceAlerts(cursor.current,feed.posts,openedAt.current);
    cursor.current=next.cursor;
    if(next.added.length) setUnread(n=>n+next.added.length);
  },[feed,feedCurrent,reading.requests.feed]);
  const records=timeline?.entries??[];
  const latest=records.at(0);
  const fallback=!latest&&legacy.find(e=>!e.conflict&&['banked','global'].includes(e.kind));
  const cards=latest?[latest,...new Set([
    records.find(e=>e.kind==='banked'&&e.status==='announced'&&e.url),
    records.find(e=>e.kind==='global')
  ].filter((e):e is PublicRecord=>!!e&&e!==latest))]:[];
  return <>
    <section className="today-panel public-panel" aria-labelledby="today-title">
      <div className="today-heading"><span className="eyebrow">公共重置状态</span><span className="meta">独立观察 · 非官方</span></div>
      <h1 id="today-title">{latest?`最新收录：${recordName(latest)}`:'暂无可核对的公共重置信息'}</h1>
      <PartState reading={reading} part="timeline" updated={timeline?.updated??null} stale={timelineStale} zone={zone}/>
      {cards.length?<ul className="public-list">{cards.map((e,i)=>{
        const old=legacy.find(l=>e.url&&normalizePostLink(l.url)===e.url);
        const conflict=old&&(old.conflict||old.kind!==e.kind||Math.abs(Date.parse(old.at)-Date.parse(e.at))>60000);
        return <li key={`${e.id}:${i}`}>
          <div className="public-row-head"><strong>{recordName(e)}</strong><time dateTime={e.at}>{formatTime(e.at,zone)}</time></div>
          <p>{e.status==='observed'?'仅为来源或其监测账户的观察，其他账户到账情况未知。':e.status==='announced'?'公告已收录，实际生效范围与到账状态待核实。':'记录类型或生效情况尚未确认。'}{e.effective&&` 来源另列生效时间：${formatTime(e.effective,zone)}。`}</p>
          {conflict&&<p className="warning">旧历史来源对同一原帖的类型或时间记录有差异。</p>}
          {e.url&&<Link href={e.url}>查看原帖</Link>}
        </li>;
      })}</ul>:fallback?<div className="latest-record"><div><strong>其他来源历史参考：{fallback.kind==='banked'?'赠送次数':'公共重置'}</strong><p>{formatTime(fallback.at,zone,fallback.dayOnly)} · {fallback.origins.join('、')} · 仅作历史参考，当前生效状态未知</p></div>{fallback.url&&<Link href={fallback.url}>查看来源记录</Link>}</div>:<p className="empty compact">可查看下方历史和来源状态；未收录不代表未发生。</p>}
      <p className="footnote">赠送次数通常需自行使用。公告、观察和账户实际生效是不同的状态。</p>
      <Credit/>
    </section>
    <section id="tibo" aria-labelledby="tibo-title">
      <div className="section-head"><h2 id="tibo-title">Tibo 重置动态</h2></div>
      <PartState reading={reading} part="feed" updated={feed?.updated??null} stale={feedStale} zone={zone}/>
      <div role="status" className={unread?'new-post-notice':''}>{unread>0&&<><strong>发现 {unread} 条新的重置相关动态</strong> <button className="secondary" onClick={()=>setUnread(0)}>标为已读</button></>}</div>
      {feed?.inconsistent ? <p className="notice">同一帖子存在内容或时间冲突，已隐藏冲突记录并暂停本次提醒。</p>:null}
      {feed&&feed.scope!=='timeline'&&<p className="notice">当前来源只提供部分动态，可能缺少帖子或回复。</p>}
      {feed?.posts.length?<ul className="public-list">{feed.posts.slice(0,12).map(post=><li key={post.id}>
        <div className="public-row-head"><strong>{post.reply?'回复':'帖子'} · {post.relevant?'重置相关':'相关性待确认'}</strong><time dateTime={post.at}>{formatTime(post.at,zone)}</time></div>
        {post.translation&&<p className="post-quote"><span className="meta">来源译文（术语可能有误）</span><br/>{post.translation}</p>}
        <p className="post-quote" lang="en">{post.text}</p>
        {!post.translation&&<p className="meta">暂无可用译文，可尝试 Safari 菜单中的网页翻译。</p>}
        <div className="post-links"><Link href={post.url}>查看 X 原帖</Link>{post.parent&&<Link href={`https://x.com/i/web/status/${post.parent}`}>查看被回复的帖子</Link>}</div>
      </li>)}</ul>:<p className="empty compact">暂无可显示的相关动态。</p>}
      <p className="footnote">显示最近最多 12 条收录动态，可能遗漏帖子和回复。页面打开且可见时检查，返回页面后补查。</p>
      <Credit/>
    </section>
  </>;
}

function normalizePostLink(href:string) {
  const match=/^https:\/\/(?:www\.)?(?:twitter|x)\.com\/thsottiaux\/status\/(\d+)/i.exec(href);
  return match?`https://x.com/thsottiaux/status/${match[1]}`:'';
}
export function ForecastEvidence({reading,legacy,zone,now}:{reading:Reading;legacy:Reading[];zone:Zone;now:number}) {
  const raw=reading.parts.audit?.raw;
  const audit=useMemo(()=>readPart(raw,normalizeAudit),[raw]);
  return <section id="forecast" aria-labelledby="forecast-title">
    <div className="section-head"><h2 id="forecast-title">重置估算</h2><span className="meta">实验性参考</span></div>
    <p className="notice"><strong>目前不可可靠估算未来 24 或 48 小时的公共重置概率。</strong></p>
    <PartState reading={reading} part="audit" updated={audit?.updated??null} stale={!audit||publicStale(audit.updated,now)} zone={zone}/>
    {audit&&<p className="section-description">来源报告 {audit.sample} 个滚动回测样本；Brier 分数（越低越好）：模型 {audit.model}、朴素基线 {audit.naive}、历史发生率基线 {audit.rate}。{audit.model>=Math.min(audit.naive,audit.rate)?'模型未超过两条基线。':'来源分数未经过本站独立复现。'} 重置基准：{formatTime(audit.basis,zone)}。</p>}
    <p className="footnote">本站未独立复现回测或验证历史覆盖。旧来源的更新时间、历史样本和方法仍可查看。</p>
    <Credit/>
    {legacy.map(r=><details className="forecast-unavailable" key={r.source.id}>
      <summary>{r.source.name} · 旧估算依据</summary>
      <div className="forecast-expanded">
        <p>{r.payload?.forecast?.explanation||'没有可核对的估算说明。'}</p>
        <p>上游更新：{formatTime(r.payload?.forecast?.at??null,zone)} · 重置基准：{formatTime(r.payload?.forecast?.basisAt??null,zone)}</p>
        {r.payload?.forecast?.sample!=null&&<p>来源样本数：{r.payload.forecast.sample}</p>}
        <Link href={r.payload?.forecast?.methodUrl||r.source.home}>来源说明</Link>
      </div>
    </details>)}
  </section>;
}
