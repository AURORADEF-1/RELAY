'use client';
import {useEffect,useState} from 'react';
import {assetRequest} from '@/components/assets/request';
type Permission={user_id:string;workshop:boolean;parts:boolean;hire:boolean};
type Data={users:{id:string;full_name:string|null;role:string}[];permissions:Permission[]};
export function WorkflowAccess(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{const abort=new AbortController();void assetRequest<Data>('/api/fleet/workflow/access?manage=true',abort.signal).then(setData).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[version]);
 const permission=data?.permissions.find(p=>p.user_id===selected);
 return <details><summary>Designate workshop, parts and hire staff</summary><p>Admins have all permissions. Hire permission allows release and overrides. Every change is recorded.</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<label>Staff member<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setMessage('')}}><option value="">Choose staff member</option>{data?.users.filter(u=>u.role!=='admin').map(u=><option key={u.id} value={u.id}>{u.full_name||u.id}</option>)}</select></label>{selected&&<form key={selected+version} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{await assetRequest('/api/fleet/workflow/access',undefined,{userId:selected,workshop:f.has('workshop'),parts:f.has('parts'),hire:f.has('hire')});setMessage('Staff permissions saved.');setVersion(v=>v+1)}catch(err){setError(err instanceof Error?err.message:'Unable to save permissions')}finally{setBusy(false)}}}>{(['workshop','parts','hire'] as const).map(team=><label key={team}><input disabled={busy} type="checkbox" name={team} defaultChecked={permission?.[team]??false}/>{team==='hire'?'Hire — release and override':team}</label>)}<button disabled={busy||!data}>Save permissions</button></form>}</details>;
}
