"use client";
import {useEffect,useMemo,useState} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import {hirePageSchema} from '@/lib/integrations/roam/hires';
export function useOnHire(enabled:boolean,version:number){
 const [state,setState]=useState<{ids:string[];unlinked:number;checkedAt:string|null;error:string}>({ids:[],unlinked:0,checkedAt:null,error:''});
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();let running=false;
  async function refresh(){
   if(running)return;running=true;
   try{
    const token=await getSupabaseAccessToken();if(!token)throw Error('Sign in to view ROAM hires.');
    const ids=new Set<string>(),seen=new Set<string>();let cursor:string|null=null,unlinked=0,count=0;
    do{
     const response=await fetch('/api/integrations/roam/hires'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
     if(!response.ok)throw Error('ROAM hire information unavailable.');
     const page=hirePageSchema.parse(await response.json());count+=page.items.length;
     if(count>50000||seen.size>=500)throw Error('ROAM hire list is too large.');
     for(const hire of page.items){if(hire.status!=='on_site')continue;const id=hire.machine.relay_id;if(typeof id==='string'&&id)ids.add(id);else unlinked++;}
     cursor=page.next_cursor;if(cursor&&seen.has(cursor))throw Error('ROAM hire list changed.');if(cursor)seen.add(cursor);
    }while(cursor);
    if(!controller.signal.aborted)setState({ids:[...ids],unlinked,checkedAt:new Date().toISOString(),error:''});
   }catch{if(!controller.signal.aborted)setState({ids:[],unlinked:0,checkedAt:null,error:'ROAM hire information unavailable. Refresh view to retry.'});}finally{running=false;}
  }
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},60000);
  return()=>{controller.abort();clearInterval(timer)};
 },[enabled,version]);
 const ids=useMemo(()=>new Set(enabled?state.ids:[]),[enabled,state.ids]);
 return {...state,ids};
}
