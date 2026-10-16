'use client';
import {useState} from 'react';
import type {Trip} from './workspace';
import {tripHistoryCsv,tripHistoryPdf} from '@/lib/trip-history/export';
import {getSupabaseAccessToken} from '@/lib/supabase';

function save(content:BlobPart,type:string,name:string){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const safe=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'machine';
async function withRoadNames(trips:Trip[]){
 const points=trips.flatMap(trip=>trip.route_points),addresses=new Map<string,string|null>(),unique=[...new Map(points.map(point=>[`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`,point])).values()];
 const token=await getSupabaseAccessToken();if(!token)return trips;
 const preview=window.localStorage.getItem('relay-demo-access-view'),headers={Authorization:`Bearer ${token}`,...(preview?{'x-relay-preview-access-group':preview}:{})};
 for(let index=0;index<unique.length;index+=50){const batch=unique.slice(index,index+50),query=batch.map(point=>`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`).join(';');try{const response=await fetch(`/api/maps/reverse-geocode?${new URLSearchParams({points:query})}`,{headers});if(!response.ok)continue;const body=await response.json() as {addresses?:unknown[]};batch.forEach((point,offset)=>addresses.set(`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`,typeof body.addresses?.[offset]==='string'?body.addresses[offset] as string:null));}catch{/* Coordinates remain available if an address lookup fails. */}}
 return trips.map(trip=>({...trip,route_points:trip.route_points.map(point=>({...point,address:addresses.get(`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`)??null}))}));
}

export function TripExportMenu({machine,from,to,trips}:{machine:string;from:string;to:string;trips:Trip[]}){
 const [busy,setBusy]=useState<'csv'|'pdf'|null>(null),[error,setError]=useState('');
 async function download(format:'csv'|'pdf'){try{setBusy(format);setError('');if(format==='csv'){const detailedTrips=await withRoadNames(trips);save(tripHistoryCsv({machine,from,to,trips:detailedTrips}),'text/csv;charset=utf-8',`${safe(machine)}_${from}_${to}.csv`);}else{const bytes=await tripHistoryPdf({machine,from,to,trips}),buffer=new ArrayBuffer(bytes.byteLength);new Uint8Array(buffer).set(bytes);save(buffer,'application/pdf',`${safe(machine)}_${from}_${to}.pdf`);}}catch{setError('Export could not be prepared. Please retry.');}finally{setBusy(null);}}
 return <details className="trip-export"><summary>Export</summary><div><button type="button" disabled={!!busy||!trips.length} onClick={()=>void download('csv')}>{busy==='csv'?'Preparing...':'CSV'}</button><button type="button" disabled={!!busy||!trips.length} onClick={()=>void download('pdf')}>{busy==='pdf'?'Preparing...':'PDF'}</button>{error&&<span role="alert">{error}</span>}</div></details>;
}
