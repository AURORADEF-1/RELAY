'use client';
import {useEffect,useState,useMemo} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import {signWatchState,type SignWatchFeed} from '@/lib/sign-watch/model';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export function useSignWatch(enabled=true){
 const [feed,setFeed]=useState<SignWatchFeed|null>(null),[error,setError]=useState(''),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!enabled)return;let active=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
 async function load(){try{const token=await getSupabaseAccessToken();if(!token)throw Error('Sign in to view Sign Watch.');const r=await fetch('/api/sign-watch',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'Sign Watch unavailable.');if(active){setFeed(d);setError('');}}catch(e){if(active)setError(e instanceof Error?e.message:'Sign Watch unavailable.');}finally{if(active)timer=setTimeout(load,5000);}}
 void load();const clock=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearTimeout(timer);clearInterval(clock);controller.abort();};},[enabled]);
 const state=signWatchState(feed,now,!!error);
 const latitude=state.location?.latitude,longitude=state.location?.longitude,receivedAt=feed?.latest?.received_at;
 const machine=useMemo<LinkedJcbMachine|null>(()=>enabled?{source:'signwatch',pin:'sign-watch-test',equipmentId:'Test',model:'',position:latitude!==undefined&&longitude!==undefined?{latitude,longitude,at:receivedAt??null}:null,relay:null,match:'confirmed',assetCategory:'Sign Watch',assetGroup:'Sign Watch'}:null,[enabled,latitude,longitude,receivedAt]);
 return {feed,state,error,machine};
}
