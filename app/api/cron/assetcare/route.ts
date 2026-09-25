import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {validCronAuthorization} from '@/lib/integrations/jcb/cron-auth';
import {jcbJson} from '@/lib/integrations/jcb/server';
import {prepareYardInbox} from '@/lib/integrations/assetcare/yard-inbox';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {collectCycle,StreamError} from '@/lib/integrations/assetcare/stream';
export const maxDuration=120;
export async function GET(request:NextRequest){
 if(!validCronAuthorization(request.headers.get('authorization'),process.env.CRON_SECRET))return jcbJson({error:'Unauthorized'},401);
 if(process.env.ASSETCARE_ENABLED!=='true')return jcbJson({enabled:false});
 const key=process.env.ASSETCARE_API_KEY,ownerId=process.env.ASSETCARE_OWNER_ID;
 if(!key||!ownerId)return jcbJson({error:'Asset Care+ configuration incomplete.'},503);
 const db=operationsDatabase(),owner=randomUUID();
 const claim=await db.rpc('claim_assetcare_stream',{p_owner:owner});
 if(claim.error)return jcbJson({error:'Unable to lock Asset Care+ collection.'},503);
 if(!claim.data)return jcbJson({paused:true});
 try{
  const owners=process.env.ASSET_INBOX_ENABLED==='true'?await ownership(db):null;
  const result=await collectCycle({key,ownerId,save:async(hash,items,assets)=>{const projected=owners?await prepareYardInbox(db,items,ownerId,owners.registry,owners.allowed):assets;const saved=await db.rpc('save_assetcare_batch',{p_owner:owner,p_hash:hash,p_items:items,p_assets:projected});if(saved.error||saved.data!==true)throw new Error('Save failed');},acknowledged:async(progress)=>{const saved=await db.from('assetcare_stream_state').update({last_ack_at:new Date().toISOString(),last_cycle:progress}).eq('id',true).eq('owner',owner).select('id');if(saved.error||saved.data?.length!==1)throw new Error('Acknowledgement status unavailable');}});
  const saved=await db.from('assetcare_stream_state').update({owner:null,lease_until:null,last_error:null,last_cycle:result,next_allowed_at:new Date(Date.now()+(result.drained?60000:5000)).toISOString()}).eq('id',true).eq('owner',owner).select('id');
  if(saved.error||saved.data?.length!==1)throw new Error('Cycle status unavailable');
  return jcbJson(result);
 }catch(e){
  // An empty long poll may return 500; it is deliberately not recorded as an
  // all-clear or retried in a tight loop. No error body/credential is logged.
  const status=e instanceof StreamError?e.status:503,delay=e instanceof StreamError?e.retryAfter:300;
  const message=status===500?'No batch returned; provider may have an empty queue.':`Collection needs attention (${status}).`;
  await db.from('assetcare_stream_state').update({owner:null,lease_until:null,last_error:message,next_allowed_at:new Date(Date.now()+Math.max(status===401?3600:300,delay)*1000).toISOString()}).eq('id',true).eq('owner',owner);
  return jcbJson({error:message},503);
 }
}
