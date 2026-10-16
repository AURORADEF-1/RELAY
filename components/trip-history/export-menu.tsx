'use client';
import {useState} from 'react';
import type {Trip} from './workspace';
import {tripHistoryCsv,tripHistoryPdf} from '@/lib/trip-history/export';

function save(content:BlobPart,type:string,name:string){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const safe=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'machine';

export function TripExportMenu({machine,from,to,trips}:{machine:string;from:string;to:string;trips:Trip[]}){
 const [busy,setBusy]=useState<'csv'|'pdf'|null>(null),[error,setError]=useState('');
 async function download(format:'csv'|'pdf'){try{setBusy(format);setError('');const input={machine,from,to,trips};if(format==='csv')save(tripHistoryCsv(input),'text/csv;charset=utf-8',`${safe(machine)}_${from}_${to}.csv`);else{const bytes=await tripHistoryPdf(input),buffer=new ArrayBuffer(bytes.byteLength);new Uint8Array(buffer).set(bytes);save(buffer,'application/pdf',`${safe(machine)}_${from}_${to}.pdf`);}}catch{setError('Export could not be prepared. Please retry.');}finally{setBusy(null);}}
 return <details className="trip-export"><summary>Export</summary><div><button type="button" disabled={!!busy||!trips.length} onClick={()=>void download('csv')}>{busy==='csv'?'Preparing...':'CSV'}</button><button type="button" disabled={!!busy||!trips.length} onClick={()=>void download('pdf')}>{busy==='pdf'?'Preparing...':'PDF'}</button>{error&&<span role="alert">{error}</span>}</div></details>;
}
