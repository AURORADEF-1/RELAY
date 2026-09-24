import 'server-only';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {NextRequest} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {JcbError} from '@/lib/integrations/jcb/client';
import type {RegistryMachine,LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export function operationsDatabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.JCB_HEALTH_DATABASE_KEY;
 if(!url||!key)throw new JcbError('Fleet Operations storage is not configured.',503);
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function authorizeOperations(request:NextRequest){
 const auth=await authorizeRelayRequesterRoute(request);
 if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const profile=await auth.supabase.from('profiles').select('role').eq('id',auth.user.id).single();
 if(profile.error)throw new JcbError('Unable to verify administrator access.',503);
 if(profile.data.role!=='admin')throw new JcbError('Admin access is required.',403);
 return auth;
}
export async function allRows<T>(db:SupabaseClient,table:string,columns:string,order:string):Promise<T[]>{
 const all:T[]=[];
 for(let offset=0;offset<50000;offset+=500){let query=db.from(table).select(columns);for(const key of order.split(','))query=query.order(key);const r=await query.range(offset,offset+499);if(r.error)throw new JcbError('Unable to verify fleet ownership or reporting history.',503);const rows=r.data as unknown as T[];all.push(...rows);if(rows.length<500)return all;}
 throw new JcbError('Fleet data exceeds the reporting limit. Report unavailable.',503);
}
export async function ownership(db:SupabaseClient){
 const [registry,customers]=await Promise.all([allRows<RegistryMachine&{lifecycle_status:string}>(db,'machines','id,machine_number,serial_number,make,model,lifecycle_status','id'),allRows<{machine_id:string}>(db,'customer_fleet_machines','machine_id,fleet_id','machine_id,fleet_id')]);
 const customerIds=new Set(customers.map(m=>m.machine_id));
 return {registry,allowed:new Set(registry.filter(m=>m.lifecycle_status==='active'&&!customerIds.has(m.id)).map(m=>m.id))};
}
export function eligibleMachines(machines:LinkedJcbMachine[],allowed:Set<string>){
 // Multiple provider identities for one asset are excluded rather than double-counted.
 const eligible=machines.filter(m=>m.relay&&allowed.has(m.relay.id));
 const counts=new Map<string,number>();eligible.forEach(m=>counts.set(m.relay!.id,(counts.get(m.relay!.id)||0)+1));
 return eligible.filter(m=>counts.get(m.relay!.id)===1);
}
