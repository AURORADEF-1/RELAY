'use client';
import {useEffect,useState} from 'react';
import {getSupabaseAccessToken} from '@/lib/supabase';
import {machineKey,machineBrand} from '@/lib/integrations/jcb/types';
import {healthLabel,priorityRank,type HealthRow} from '@/lib/integrations/jcb/health';
import {FaultCards} from '@/components/jcb/fault-cards';
import type {OperationRow} from '@/lib/fleet-operations/report';
import '@/components/jcb/health.css';
export function OperationsHealth({machines,initialSearch=''}:{machines:OperationRow[];initialSearch?:string}){
 const [rows,setRows]=useState<HealthRow[]>([]),[errors,setErrors]=useState<string[]>([]),[loading,setLoading]=useState(true),[version,setVersion]=useState(0),[search,setSearch]=useState(initialSearch),[filter,setFilter]=useState('all');
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setRows([]);setErrors([]);
  async function load(provider:'jcb'|'trackunit',token:string){
   try{let after:string|null=null;do{
    const response=await fetch(`/api/integrations/${provider}/health${after?`?after=${encodeURIComponent(after)}`:''}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
    const data:{rows:HealthRow[];next:string|null;error?:string}=await response.json();if(!response.ok)throw new Error(data.error||'Health check unavailable.');
    if(controller.signal.aborted)return;setRows(previous=>[...previous,...data.rows]);after=data.next;
   }while(after);}catch(e){if(!controller.signal.aborted)setErrors(previous=>[...previous,`${provider==='jcb'?'JCB':'Manitou'}: ${e instanceof Error?e.message:'Unable to check faults.'}`]);}
  }
  void (async()=>{try{const token=await getSupabaseAccessToken();if(!token)throw new Error('Sign in to check fleet health.');await Promise.all([load('jcb',token),load('trackunit',token)]);}catch(e){if(!controller.signal.aborted)setErrors([e instanceof Error?e.message:'Unable to check health.']);}finally{if(!controller.signal.aborted)setLoading(false);}})();
  return()=>controller.abort();
 },[version]);
 const allowed=new Set(machines.map(r=>machineKey(r.machine)));
 const included=rows.filter(r=>allowed.has(machineKey(r.machine)));
 const visible=included.filter(r=>`${r.machine.relay?.machine_number} ${r.machine.equipmentId} ${r.machine.model} ${r.machine.pin} ${r.faults.map(f=>`${f.code} ${f.description}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())&&(filter==='all'||filter==='faults'&&r.faults.length>0||filter==='unavailable'&&r.faultError||r.issues.some(i=>i.priority===filter))).sort((a,b)=>(a.issues[0]?priorityRank(a.issues[0].priority):3)-(b.issues[0]?priorityRank(b.issues[0].priority):3)||(a.machine.relay?.machine_number??'').localeCompare(b.machine.relay?.machine_number??'',undefined,{numeric:true}));
 return <section className="fo-health"><div className="fo-section-heading"><div><h2>Fleet Health &amp; Error Codes</h2><p>JCB and Manitou · grouped by machine · recent and historical provider reports</p></div><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh health</button></div>
 <p role="status">{loading?'Checking machines… ':''}{included.length} / {machines.length} tracked MLP machines checked · {included.filter(r=>r.faults.length).length} with reported codes · {included.filter(r=>r.faultError).length} checks unavailable</p>
 <p>Readings may describe a previous fault. Confirm the current machine display before arranging repairs. No pop-up notifications are sent.</p>
 {errors.map(e=><p role="alert" className="fo-error" key={e}>{e} Results are incomplete.</p>)}
 {!loading&&included.length<machines.length&&<p className="fo-error">Some machines have not been assessed. Missing records are not a mechanical all-clear.</p>}
 <div className="fo-controls"><label>Find machine or error code<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Fleet number, model, code or description"/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All checked machines</option><option value="faults">Machines with error codes</option><option value="urgent">Priority inspection</option><option value="review">Needs review</option><option value="unavailable">Checks unavailable</option></select></label></div>
 <div className="fo-health-list">{visible.map(row=><details key={machineKey(row.machine)} className="fo-machine-health"><summary><span><strong>{row.machine.relay?.machine_number||row.machine.equipmentId}</strong> · {machineBrand(row.machine)} {row.machine.model}<small>{healthLabel(row)} · {row.faultError?'Fault data unavailable':`${row.faults.length} reported codes`}</small></span><span className="fo-codes">{row.faults.slice(0,4).map(f=>f.code).join(' · ')||'View health readings'}{row.faults.length>4?` +${row.faults.length-4} more`:''}</span></summary><div className="fo-health-detail">{row.issues.filter(i=>!i.code).map(i=><p key={i.key}><strong>{i.title}: </strong>{i.detail} {i.action}</p>)}{row.faultError?<p className="fo-error">The provider could not return all health data. Retry or check directly with the operator.</p>:null}<FaultCards machine={row.machine} faults={row.faults} checkedAt={row.checkedAt}/></div></details>)}</div>
 {!visible.length&&!loading&&<p>No checked machines match this filter.</p>}
 </section>;
}
