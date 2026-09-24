import 'server-only';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {JcbError} from './provider-error';
export type FleetProvider = 'jcb' | 'trackunit' | 'takeuchi';
const INTERVAL = 15 * 60_000;
function database() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.JCB_HEALTH_DATABASE_KEY;
 if(!url||!key)throw new JcbError('Fleet request guard is not configured.',503);
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function retryUntil(value:string|null,now=Date.now()) {
 const seconds=value?.trim() && /^\d+$/.test(value.trim()) ? Number(value)*1000 : NaN;
 const parsed=Number.isFinite(seconds)?now+seconds:Date.parse(value||'');
 return new Date(Math.max(now+INTERVAL,Number.isFinite(parsed)&&Math.abs(parsed)<=8.64e15?parsed:0)).toISOString();
}
// Called for every actual network attempt, including token requests and pagination.
// Never pass URLs or credentials to storage; the provider identifier is sufficient.
export async function guardedFetch(provider:FleetProvider,load:()=>Promise<Response>) {
 const db=database();
 const admit=await db.rpc('admit_fleet_api_request',{p_provider:provider});
 if(admit.error||admit.data!==true)throw new JcbError('Fleet provider is cooling down or its request allowance is in use. Retry later.',503);
 const response=await load();
 if(response.status===429 || response.status===503 && response.headers.has('Retry-After')) {
  const saved=await db.rpc('cooldown_fleet_api',{p_provider:provider,p_until:retryUntil(response.headers.get('Retry-After'))});
  if(saved.error)throw new JcbError('Unable to store provider cooldown. Retry later.',503);
  throw new JcbError('Fleet provider has requested a pause. Cached readings remain available; retry later.',503);
 }
 return response;
}
// One shared successful snapshot per logical operation for 15 minutes. Changing
// a fault date range cannot bypass this key. A crashed/failed worker retains its
// 15-minute lease; an owner token fences late writes after lease takeover.
export async function cachedProvider<T>(provider:FleetProvider,key:string,load:()=>Promise<T>):Promise<{data:T;checkedAt:string}> {
 const db=database(),owner=randomUUID();
 const claim=await db.rpc('claim_fleet_api_cache',{p_provider:provider,p_key:key,p_owner:owner});
 if(claim.error)throw new JcbError('Fleet cache is unavailable.',503);
 if(claim.data?.state==='cached')return {data:claim.data.data as T,checkedAt:claim.data.checkedAt};
 if(claim.data?.state!=='load')throw new JcbError('Fleet readings are updating or cooling down. Retry shortly.',503);
 const data=await load(),checkedAt=new Date().toISOString();
 const takeuchi=provider==='takeuchi'&&key!=='operations-collection';
 let write=db.from(takeuchi?'takeuchi_api_cache':'fleet_api_cache').update({payload:data,checked_at:checkedAt,lease_until:new Date(Date.now()+INTERVAL).toISOString()});
 if(!takeuchi)write=write.eq('provider',provider);
 const saved=await write.eq('cache_key',key).eq('owner',owner).select('cache_key');
 if(saved.error||saved.data?.length!==1)throw new JcbError('Unable to store fleet readings.',503);
 return {data,checkedAt};
}
