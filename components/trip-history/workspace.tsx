'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import './style.css';

const TripMap=dynamic(()=>import('./trip-map'),{ssr:false,loading:()=> <div className="trip-map trip-map-loading">Loading trip map…</div>});
export type Trip={id:string;asset_id:string;asset_name:string;started_at:string|null;ended_at:string;start_latitude:number|null;start_longitude:number|null;start_address:string|null;end_latitude:number|null;end_longitude:number|null;end_address:string|null;distance:number|null;odometer:number|null;speed_kph:number|null};
type Result={trips:Trip[];archive_start:string|null;latest_saved:string|null};
const isoDay=(date:Date)=>date.toISOString().slice(0,10);
const when=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not supplied';
const place=(address:string|null,lat:number|null,lon:number|null)=>address||lat!==null&&lon!==null?address||`${lat!.toFixed(5)}, ${lon!.toFixed(5)}`:'Position not supplied';
const tripResponse=async(response:Response)=>{
 const raw=await response.text();let body:unknown={};
 try{body=raw?JSON.parse(raw):{};}catch{
  if(response.status===504||response.status===408)throw new Error('Trip history is taking too long. Please retry.');
  throw new Error('Trip history is unavailable. Please retry.');
 }
 const result=(body&&typeof body==='object'?body:{}) as Partial<Result>&{error?:unknown};
 if(!response.ok)throw new Error(typeof result.error==='string'&&result.error.trim()?result.error:response.status===504?'Trip history is taking too long. Please retry.':'Trip history is unavailable. Please retry.');
 if(!Array.isArray(result.trips))throw new Error('Trip history is unavailable. Please retry.');
 return result as Result;
};

export function TripHistoryWorkspace(){
 const [today]=useState(()=>new Date());
 const [from,setFrom]=useState(()=>isoDay(new Date(today.getTime()-6*86400000))),[to,setTo]=useState(()=>isoDay(today)),[query,setQuery]=useState(''),[data,setData]=useState<Result|null>(null),[selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const setQuickRange=(days:number)=>{const end=new Date(today),start=new Date(today);if(days===1){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}else start.setDate(start.getDate()-(days-1));setFrom(isoDay(start));setTo(isoDay(end));};
 useEffect(()=>{const search=query.trim();if(!search)return;const c=new AbortController();const timer=window.setTimeout(()=>{setLoading(true);setError('');void getSupabaseAccessToken().then(token=>{if(!token)throw new Error('Sign in to view trip history.');return fetch(`/api/assets/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&search=${encodeURIComponent(search)}`,{headers:{Authorization:`Bearer ${token}`},signal:c.signal});}).then(tripResponse).then(body=>{if(!c.signal.aborted){setData(body);setSelected(current=>body.trips.some(t=>t.id===current)?current:body.trips[0]?.id??null);}}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Trip history unavailable.');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});},300);return()=>{window.clearTimeout(timer);c.abort();};},[from,to,query,version]);
 const trips=useMemo(()=>{const q=query.trim().toLowerCase();return !q?data?.trips??[]:(data?.trips??[]).filter(t=>`${t.asset_name} ${t.asset_id}`.toLowerCase().includes(q));},[data,query]);
 const chosen=trips.find(t=>t.id===selected)??trips[0]??null;
 const assets=new Set(trips.map(t=>t.asset_id)).size;
 return <section className="trip-history">
  <header className="trip-toolbar"><label className="trip-search">Find a machine<input value={query} onChange={e=>{const value=e.target.value;setQuery(value);if(!value.trim()){setData(null);setSelected(null);setError('');setLoading(false);}}} placeholder="Fleet number, registration or machine name"/></label><div className="trip-presets"><span>Quick range</span><div><button type="button" onClick={()=>setQuickRange(1)}>Yesterday</button><button type="button" onClick={()=>setQuickRange(7)}>Last 7 days</button><button type="button" onClick={()=>setQuickRange(30)}>Last 30 days</button></div></div><label>From<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} max={isoDay(today)} onChange={e=>setTo(e.target.value)}/></label><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh</button><Link href="/fleet/map">Fleet map</Link></header>
  {error&&<p className="trip-warning" role="alert">{error}</p>}
  {!query.trim()&&!loading&&<p className="trip-empty">Search for a machine to view its trip history.</p>}
  {!error&&loading&&<p role="status">Loading AssetCare+ trip history…</p>}
  {data&&<><div className="trip-layout"><aside className="trip-assets"><strong>{trips.length} trips · {assets} assets</strong><div>{trips.map(trip=><button key={trip.id} className={trip.id===chosen?.id?'selected':''} onClick={()=>setSelected(trip.id)}><b>{trip.asset_name}</b><span>{when(trip.ended_at)}</span><small>{place(trip.end_address,trip.end_latitude,trip.end_longitude)}</small></button>)}{!trips.length&&<p>No trips match this search and date range.</p>}</div></aside><main className="trip-main"><TripMap trips={trips} selected={chosen?.id??null}/>{chosen&&<div className="trip-detail"><section><span className="trip-eyebrow">Selected journey</span><h2>{chosen.asset_name}</h2><p><b>{when(chosen.started_at)}</b> — <b>{when(chosen.ended_at)}</b></p><ol><li><time>{chosen.started_at?new Date(chosen.started_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—'}</time><div><b>Trip started</b><span>{place(chosen.start_address,chosen.start_latitude,chosen.start_longitude)}</span></div></li><li><time>{new Date(chosen.ended_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time><div><b>Trip ended</b><span>{place(chosen.end_address,chosen.end_latitude,chosen.end_longitude)}</span></div></li></ol></section><dl><div><dt>Duration</dt><dd>{duration(chosen)}</dd></div><div><dt>Distance</dt><dd>{chosen.distance===null?'Not supplied':`${chosen.distance.toFixed(1)} km`}</dd></div><div><dt>Odometer</dt><dd>{chosen.odometer===null?'Not supplied':`${chosen.odometer.toFixed(1)} km`}</dd></div><div><dt>End speed</dt><dd>{chosen.speed_kph===null?'Not supplied':`${(chosen.speed_kph/1.609344).toFixed(1)} mph`}</dd></div></dl></div>}</main></div><footer>AssetCare+ archive from {when(data.archive_start)} · latest data saved {when(data.latest_saved)}. Routes use provider-recorded trip endpoints.</footer></>}
 </section>;
}
function duration(trip:Trip){if(!trip.started_at)return 'Not supplied';const ms=Date.parse(trip.ended_at)-Date.parse(trip.started_at);if(!Number.isFinite(ms)||ms<0)return 'Not supplied';const mins=Math.round(ms/60000);return mins>=60?`${Math.floor(mins/60)} h ${mins%60} min`:`${mins} min`;}
