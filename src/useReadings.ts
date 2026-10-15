import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { ATTEMPT_KEY,cooldownDelay,lastAttempt,readCache,refreshReading,storageOrUndefined,writeCache } from './store';
export function useReadings(){
  const storage=useMemo(storageOrUndefined,[]);
  const [readings,setReadings]=useState(()=>readCache(storage)),ref=useRef(readings),busy=useRef(false),attempted=useRef(lastAttempt(storage));
  const [loading,setLoading]=useState(false),[now,setNow]=useState(Date.now()),[cacheWarning,setCacheWarning]=useState(false);
  const refresh=useCallback(async()=>{
    if(busy.current||cooldownDelay(attempted.current)>0)return;
    busy.current=true;attempted.current=Date.now();setNow(Date.now());setLoading(true);
    try{
      try{storage?.setItem(ATTEMPT_KEY,String(attempted.current));}catch{setCacheWarning(true);}
      await Promise.all(ref.current.map(async r=>{
        const next=await refreshReading(r);ref.current=ref.current.map(x=>x.source.id===next.source.id?next:x);setReadings([...ref.current]);
        if(!writeCache(ref.current,storage))setCacheWarning(true);
      }));
    }finally{busy.current=false;setLoading(false);setNow(Date.now());}
  },[storage]);
  useEffect(()=>{
    let wake:ReturnType<typeof setTimeout>|undefined;
    const request=()=>{
      if(document.visibilityState!=='visible')return;
      const delay=cooldownDelay(attempted.current);
      if(delay>0){clearTimeout(wake);wake=setTimeout(request,delay+20);}else void refresh();
    };
    request();
    const tick=setInterval(()=>{if(document.visibilityState==='visible')setNow(Date.now());},1000);
    const poll=setInterval(request,300000);
    const visible=()=>{if(Date.now()-attempted.current>=300000||ref.current.some(r=>Object.values(r.requests).some(s=>s.outcome==='waiting')))request();};
    document.addEventListener('visibilitychange',visible);
    return()=>{clearTimeout(wake);clearInterval(tick);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  return {readings,loading,now,cacheWarning,refresh,remaining:Math.ceil(cooldownDelay(attempted.current,now)/1000)};
}
