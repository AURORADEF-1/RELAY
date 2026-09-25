import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {LinkedJcbMachine,JcbFault} from '@/lib/integrations/jcb/types';
import type {Snapshot} from '@/lib/fleet-operations/report';
import {movementEvents,faultEvents} from './events';
import {getJcbFaults} from '@/lib/integrations/jcb/client';
import {getTrackunitDetails} from '@/lib/integrations/trackunit/client';
import {getTakeuchiDetails} from '@/lib/integrations/takeuchi/client';
export async function recordAssetEvents(db:SupabaseClient,machine:LinkedJcbMachine){
 if(process.env.ASSET_INBOX_ENABLED!=='true'||!machine.relay)return;
 const now=Date.now(),provider=machine.source??'jcb';
 const history=await db.from('fleet_operation_samples').select('captured_at,payload').eq('machine_id',machine.relay.id).eq('provider',provider).eq('pin',machine.pin).order('captured_at',{ascending:false}).limit(100);
 if(history.error)throw new Error('Asset movement history unavailable');
 const events=movementEvents(machine,(history.data??[]) as Snapshot[],now);
 let faults:JcbFault[]=[],failed=false;
 try{if(provider==='jcb')faults=(await getJcbFaults(machine.pin)).faults;else {const d=provider==='takeuchi'?await getTakeuchiDetails(machine.pin):await getTrackunitDetails(machine.pin);faults=d.faults;failed=d.faultError;}}catch{failed=true;}
 events.push(...faultEvents(machine,faults,now));
 if(failed)events.push({event_key:`${provider}:${machine.pin}:fault-unavailable:${new Date(now).toISOString().slice(0,10)}`,machine_id:machine.relay.id,provider,kind:'data_unavailable',title:'Fault check unavailable',detail:'Provider did not return a complete fault check. This does not mean the machine is clear.',occurred_at:new Date(now).toISOString(),payload:{}});
 if(events.length){const saved=await db.from('asset_events').upsert(events,{onConflict:'event_key',ignoreDuplicates:true});if(saved.error)throw new Error('Asset inbox storage unavailable');}
}
