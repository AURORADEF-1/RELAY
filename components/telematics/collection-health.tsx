"use client";
import {useEffect,useState} from 'react';
import {collectionHealth,type CollectionState} from '@/lib/integrations/assetcare/collection-health';
export function CollectionHealth({state}:{state:CollectionState}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const health=collectionHealth(state,now);
 return <p role="status" className={health.warning?'jcb-warning':'jcb-sync'}><strong>{health.message}</strong> {state.last_cycle?.drained===false&&health.minutes!==null&&`Latest processed provider receipt is about ${health.minutes} minutes old.`} Collection target: 30 minutes or less. Machine GPS timestamps can be older. Refresh view to check the latest collection progress.</p>;
}
