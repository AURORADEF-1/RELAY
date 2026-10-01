'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import {hirePageSchema,type RoamHire} from '@/lib/integrations/roam/hires';

export function AssetHireLink({machineId}:{machineId:string}) {
 const [hires,setHires]=useState<RoamHire[]>([]);
 const [state,setState]=useState('Checking ROAM hire…');
 useEffect(()=>{
  const controller=new AbortController();
  let running=false;
  async function refresh(){
   if(running)return;
   running=true;
   try {
    const token=await getSupabaseAccessToken();
    if(!token)throw Error('Sign in to check the hire.');
    const matches:RoamHire[]=[];
    const seen=new Set<string>();
    let cursor:string|null=null;
    do {
     const response=await fetch('/api/integrations/roam/hires'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
     if(!response.ok)throw Error('Hire information unavailable.');
     const page=hirePageSchema.parse(await response.json());
     matches.push(...page.items.filter(h=>h.status==='on_site'&&h.machine.relay_id===machineId));
     cursor=page.next_cursor;
     if(cursor&&seen.has(cursor))throw Error('Hire information unavailable.');
     if(cursor)seen.add(cursor);
    }while(cursor);
    if(!controller.signal.aborted){setHires(matches);setState('');}
   }catch{if(!controller.signal.aborted){setHires([]);setState('ROAM hire information unavailable. Reopen the asset to retry.');}}finally{running=false;}
  }
  void refresh();
  const timer=setInterval(()=>{if(!document.hidden)void refresh()},60000);
  return()=>{controller.abort();clearInterval(timer)};
 },[machineId]);
 return <div aria-label="ROAM hire"><Link className="jcb-button" href={'/fleet/hours?machineId='+encodeURIComponent(machineId)}>Hour readings / export</Link>{state&&<p role="status" className="jcb-sync">{state}</p>}{hires.map(h=><p key={h.id}><span>On hire · {String(h.customer.recorded_name||h.customer.name||h.hire_reference)} </span><Link className="jcb-button jcb-primary" href={'/fleet/hires/'+encodeURIComponent(h.id)}>View hire{hires.length>1?' · '+h.hire_reference:''}</Link></p>)}</div>;
}
