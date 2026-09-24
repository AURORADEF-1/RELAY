import 'server-only';
import {createHash} from 'node:crypto';
import {getJcbFleet,JcbError} from '@/lib/integrations/jcb/client';
import {getTrackunitFleet,fetchTrackunitTelemetry} from '@/lib/integrations/trackunit/client';
import {linkMachines} from '@/lib/integrations/jcb/normalize';
import {linkTrackunitMachines,applyTelemetry} from '@/lib/integrations/trackunit/normalize';
import {operationsDatabase,ownership,allRows,eligibleMachines} from './server';
export async function collectOperations(provider:'jcb'|'trackunit'){
 const started=Date.now(),db=operationsDatabase();
 if((provider==='jcb'?process.env.JCB_LIVELINK_ENABLED:process.env.TRACKUNIT_ENABLED)!=='true')throw new JcbError('Tracking provider is disabled.',503);
 const {registry,allowed}=await ownership(db);
 const mappings=await allRows<{pin:string;machine_id:string}>(db,provider==='jcb'?'jcb_livelink_mappings':'trackunit_mappings','pin,machine_id','pin');
 const jcb=provider==='jcb'?await getJcbFleet():null,track=provider==='trackunit'?await getTrackunitFleet():null;
 const machines=eligibleMachines(jcb?linkMachines(jcb.machines,registry,mappings):linkTrackunitMachines(track!.machines,registry,mappings),allowed).sort((a,b)=>a.pin.localeCompare(b.pin));
 if(!machines.length)throw new JcbError('No eligible tracked MLP machines returned; collection incomplete.',503);
 const last=await db.from('fleet_operation_runs').select('next_pin').eq('provider',provider).order('checked_at',{ascending:false}).limit(1).maybeSingle();
 if(last.error)throw new JcbError('Unable to read reporting collection position.',503);
 const index=Math.max(0,machines.findIndex(m=>m.pin===last.data?.next_pin));const sorted=[...machines.slice(index),...machines.slice(0,index)];
 let cursor=0,checked=0,failures=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<sorted.length&&Date.now()-started<230000){let machine=sorted[cursor++];
   try{
     if(track){try{machine=applyTelemetry(machine,await fetchTrackunitTelemetry(track.machines.find(m=>m.pin===machine.pin)!.unitId));}catch{failures++;}}
     machine={...machine,source:provider};
     const sample_key=createHash('sha256').update(JSON.stringify([machine.relay!.id,provider,machine])).digest('hex');
     const saved=await db.from('fleet_operation_samples').upsert({sample_key,machine_id:machine.relay!.id,provider,pin:machine.pin,payload:machine},{onConflict:'sample_key',ignoreDuplicates:true});
     if(saved.error)throw new Error('Storage unavailable');checked++;
   }catch{failures++;}
 }}));
 const result={provider,checked,total:machines.length,failures,next_pin:cursor<sorted.length?sorted[cursor].pin:null};
 const saved=await db.from('fleet_operation_runs').insert(result);if(saved.error)throw new JcbError('Unable to record collection status.',503);
 return result;
}
