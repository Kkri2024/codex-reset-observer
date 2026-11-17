import {describe,expect,it} from 'vitest';
import {advanceAlerts,normalizeAudit,normalizeFeed,normalizeTimeline,publicStale,PUBLIC_ID} from '../src/publicEvidence';
import {readCache,refreshReading} from '../src/store';

const end='2026-11-17T10:15:00Z', start='2026-11-17T10:00:00Z', now=Date.parse(end);
const post=(i:number,at=start)=>({id:String(10000000000+i),at,url:`https://x.com/thsottiaux/status/${10000000000+i}`,
  kind:'banked',text:'A banked reset will land soon.',localized_text:'即将发放赠送重置次数。',translation_status:'translated',is_reply:true,in_reply_to_tweet_id:'10000000000'});
const feed=(tweets:unknown[],updated=end)=>({fetched_at:updated,stale:false,profile:{handle:'thsottiaux'},locale:'zh',tweets});
describe('public source boundaries',()=>{
  it('verifies author and ID, retains reply and matched translations, flags loose source classification',()=>{
    const posts=normalizeFeed(feed([post(1),{...post(2),url:post(1).url},{...post(3),kind:'limits',text:'Capacity is better',tibo_lane:'reset_related',translation_status:'pending'}]),now).posts;
    expect(posts.map(p=>p.id)).toEqual([post(3).id,post(1).id]);
    expect(posts[0]).toMatchObject({relevant:false,translation:''});
    expect(posts[1]).toMatchObject({relevant:true,reply:true,parent:'10000000000',translation:post(1).localized_text});
  });
  it('rejects inconsistent post versions and recognizes stale source time',()=>{
    const result=normalizeFeed(feed([post(1),{...post(1),text:'Different copy'}]),now);
    expect(result).toMatchObject({posts:[],inconsistent:1});
    expect(publicStale(end,now+31*60000)).toBe(true);
  });
  it('keeps a pending grant separate from observed availability even when both say confirmed',()=>{
    const p=post(1), entries=normalizeTimeline({updated_at:end,events:[
      {id:p.id,announced_at:start,type:'credits',url:p.url,banked_grant:true,confirmed:true,reset_verification_status:'pending'},
      {id:'observed',announced_at:'2026-11-17T10:01:00Z',type:'credits',source:'observed',banked_state:'available',confirmed:true,scope:'global'},
      {id:'missing',announced_at:start,type:'reset',source:'archive',confirmed:true,scope:'global'}
    ]},now).entries;
    expect(entries.map(e=>[e.kind,e.status,e.effective])).toEqual([['banked','observed',null],['banked','announced',null]]);
  });
  it('requires both finite baseline scores and exact sample metadata',()=>{
    const backtest={sample_size:368,brier:.126,baseline_brier:.127,rate_v2_brier:.125};
    expect(normalizeAudit({updated_at:end,backtest})).toMatchObject({sample:368,model:.126,rate:.125});
    expect(()=>normalizeAudit({updated_at:end,backtest:{...backtest,rate_v2_brier:null}})).toThrow();
  });
  it('keeps last successful response on rollback and marks failure per part',async()=>{
    const original=readCache().find(r=>r.source.id===PUBLIC_ID)!;
    const stamp=new Date().toISOString(), older=new Date(Date.now()-60000).toISOString();
    const initial=await refreshReading(original,async url=>String(url).includes('/feed')?Response.json(feed([post(1)],stamp)):new Response('',{status:503}));
    const failed=await refreshReading(initial,async url=>String(url).includes('/feed')?Response.json(feed([],older)):new Response('',{status:503}));
    expect(failed.parts.feed).toEqual(initial.parts.feed);
    expect(failed.requests.feed).toMatchObject({outcome:'failed',error:expect.stringContaining('倒退')});
    expect(failed.cached).toBe(true);
  });
});
describe('post alerts',()=>{
  it('ignores the baseline, old backfill and ambiguous posts, then alerts only once by ID',()=>{
    const initial=advanceAlerts(null,normalizeFeed(feed([post(1)]),now).posts,Date.parse(start)+60000);
    expect(initial.added).toEqual([]);
    const nextPosts=normalizeFeed(feed([post(1),post(2,'2026-11-17T10:00:30Z'),post(3,'2026-11-17T10:05:00Z')]),now).posts;
    const next=advanceAlerts(initial.cursor,nextPosts);
    expect(next.added.map(p=>p.id)).toEqual([post(3).id]);
    expect(advanceAlerts(next.cursor,nextPosts).added).toEqual([]);
    expect(advanceAlerts(next.cursor,[{...nextPosts[0],id:'10000000009',relevant:false}]).added).toEqual([]);
  });
});
