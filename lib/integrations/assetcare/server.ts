import 'server-only';
import {allRows,operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import type {LinkedJcbMachine} from '../jcb/types';
import {linkAssetCare} from './normalize';
import {JcbError} from '../jcb/client';
export async function getAssetCareFleet(){
 const db=operationsDatabase();
 const [assets,owners,state]=await Promise.all([allRows<{machine:LinkedJcbMachine}>(db,'assetcare_assets','machine,asset_id','asset_id'),ownership(db),db.from('assetcare_stream_state').select('last_attempt_at,last_ack_at,last_saved_at,last_error,last_cycle').eq('id',true).single()]);
 if(state.error)throw new JcbError('Asset Care+ collection status unavailable.',503);
 const machines=assets.map(a=>linkAssetCare(a.machine,owners.registry)).filter(m=>!m.relay||owners.allowed.has(m.relay.id));
 const checkedAt=state.data.last_ack_at as string|null;
 return {machines,admin:true,checkedAt,stale:!checkedAt||Date.now()-Date.parse(checkedAt)>30*60000,status:state.data};
}
