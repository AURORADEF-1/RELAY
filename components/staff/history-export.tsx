'use client';
import {useRef,useEffect,useState} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import {londonDate} from '@/lib/yard-report';
export function HistoryExport({id,label,disabled=false}:{id:string;label:string;disabled?:boolean}){
 const today=londonDate(Date.now()),[from,setFrom]=useState(today),[to,setTo]=useState(today),[busy,setBusy]=useState(''),[error,setError]=useState(''),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function download(format:'pdf'|'csv'){
  if(busy)return;setBusy(format);setError('');const c=new AbortController();controller.current=c;const timeout=setTimeout(()=>c.abort(),90000);
  try{const token=await getSupabaseAccessToken();if(!token)throw Error('Sign in to export history.');
   const q=new URLSearchParams({id,from,to,format});const r=await fetch(`/api/staff/history?${q}`,{headers:{Authorization:`Bearer ${token}`},signal:c.signal});
   if(!r.ok){const d=await r.json();throw Error(d.error||'Export unavailable.');}
   const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${label.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70)}_${from}_${to}.${format}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Export unavailable.');else setError('Export cancelled or timed out. Try a shorter range.');}finally{clearTimeout(timeout);setBusy('');}
 }
 return <details className="staff-history"><summary>History &amp; export</summary><div aria-label={`History export for ${label}`}><p>Choose up to 31 days, in UK time. Exports include daily yard summaries and all recorded driving alerts. Missing history is marked.</p><label>From<input type="date" value={from} max={to||today} disabled={!!busy||disabled} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} max={today} disabled={!!busy||disabled} onChange={e=>setTo(e.target.value)}/></label><div>{(['pdf','csv'] as const).map(f=><button key={f} disabled={!!busy||disabled||!from||!to} onClick={()=>void download(f)}>{busy===f?'Preparing…':`Download ${f.toUpperCase()}`}</button>)}</div>{error&&<p role="alert">{error}</p>}</div></details>;
}
