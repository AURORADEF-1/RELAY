import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allRows } from '@/lib/fleet-operations/server';
import { JcbError } from '@/lib/integrations/jcb/client';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';
import { lastKnownSide, usableCoordinates, type BoardMachine } from './positions';

type Position=NonNullable<LinkedJcbMachine['position']>;
export async function withPositionHistory(db: SupabaseClient, machines: LinkedJcbMachine[], now: number): Promise<BoardMachine[]> {
  const saved=machines.some(m=>m.source==='assetcare')?await allRows<{asset_id:string;observed_at:string;position_history:Position[]}>(db,'assetcare_assets','asset_id,observed_at,position_history','asset_id'):[];
  const byId=new Map(saved.map(row=>[row.asset_id,row]));
  const result:BoardMachine[]=machines.map(m=>m.source==='assetcare'?{...m,observedAt:byId.get(m.pin)?.observed_at,positionHistory:byId.get(m.pin)?.position_history??[]}:m);
  const needsHistory=result.filter(m=>m.source!=='assetcare'&&m.relay&&m.assetCategory==='Plant'&&lastKnownSide(m,now)==='unknown');
  // Read only the relevant provider identity. Bounded concurrency avoids overloading storage.
  for(let start=0;start<needsHistory.length;start+=8){
    await Promise.all(needsHistory.slice(start,start+8).map(async m=>{
      const missing=!usableCoordinates(m.position,now);
      const history:Position[]=[];
      for(let offset=0;offset<5000;offset+=100){
        const r=await db.from('fleet_operation_samples').select('payload').eq('machine_id',m.relay!.id).eq('provider',m.source??'jcb').eq('pin',m.pin).order('captured_at',{ascending:false}).order('sample_key').range(offset,offset+99);
        if(r.error)throw new JcbError('Plant position history is unavailable.',503);
        const rows=r.data as {payload:LinkedJcbMachine}[];
        history.push(...rows.flatMap(row=>usableCoordinates(row.payload.position,now)?[row.payload.position]:[]));
        if(!missing||history.length||rows.length<100)break;
        if(offset===4900)throw new JcbError('Plant position history exceeds the review limit.',503);
      }
      m.positionHistory=history;
    }));
  }
  return result;
}
