import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export async function GET(request:NextRequest){try{
 const auth=await authorizeAssets(request),q=(request.nextUrl.searchParams.get('q')??'').trim().slice(0,100).toLowerCase();
 if(q.length<2)return jcbJson({machines:[],admin:auth.admin,total:0});
 const db=operationsDatabase(),{registry,allowed}=await ownership(db);
 const matched=registry.filter(m=>allowed.has(m.id)&&q.split(/\s+/).every(t=>`${m.machine_number} ${m.serial_number??''} ${m.make??''} ${m.model??''}`.toLowerCase().includes(t))).sort((a,b)=>Number(b.machine_number.toLowerCase()===q)-Number(a.machine_number.toLowerCase()===q)||a.machine_number.localeCompare(b.machine_number,undefined,{numeric:true}));
 const latest=await db.rpc('fleet_operations_latest').limit(1000);
 const positions=new Map<string,LinkedJcbMachine>();for(const s of latest.data??[]){const old=positions.get(s.machine_id);if(!old||(Date.parse(s.payload.position?.at??'')||0)>(Date.parse(old.position?.at??'')||0))positions.set(s.machine_id,s.payload);}
 return jcbJson({admin:auth.admin,total:matched.length,locationUnavailable:!!latest.error||(latest.data?.length??0)>=1000,machines:matched.slice(0,50).map(m=>({...m,position:positions.get(m.id)?.position??null,provider:positions.get(m.id)?.source??null}))});
 }catch(e){return jcbError(e);}}
