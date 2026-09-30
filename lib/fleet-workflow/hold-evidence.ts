import 'server-only';
import type {operationsDatabase} from '@/lib/fleet-operations/server';
import type {HireAssessment} from './model';
import {holdReasons,type HoldEvidence} from './hold-reasons';
export async function addHoldReasons(db:ReturnType<typeof operationsDatabase>,rows:HireAssessment[]){
 const ids=(prefix:string)=>[...new Set(rows.flatMap(r=>r.blockers.filter(b=>b.startsWith(prefix)).map(b=>b.slice(prefix.length))))];
 async function read<T>(table:string,columns:string,keys:string[]):Promise<T[]>{
  const result:T[]=[];
  for(let i=0;i<keys.length;i+=200){const r=await db.from(table).select(columns).in('id',keys.slice(i,i+200));if(r.error)throw new Error('Hold details could not be loaded. Refresh before clearance.');result.push(...r.data as T[]);}return result;
 }
 const [tickets,faults,jobs,flags]=await Promise.all([
  read<HoldEvidence['tickets'][number]>('tickets','id,job_number,status,request_summary',ids('Open parts request: ')),
  read<HoldEvidence['faults'][number]>('asset_events','id,provider,detail,occurred_at,payload',ids('Fault requires review: ')),
  read<HoldEvidence['jobs'][number]>('workshop_incidents','id,job_number,status,description',ids('Open workshop job: ')),
  read<HoldEvidence['flags'][number]>('fleet_asset_flags','id,reason',ids('Active fleet flag: ')),
 ]);
 return rows.map(r=>({...r,holdReasons:holdReasons(r,{tickets,faults,jobs,flags})}));
}
