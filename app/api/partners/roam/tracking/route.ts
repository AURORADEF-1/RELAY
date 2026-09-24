import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeRicoFleetFeed } from '@/lib/integrations/rico/feed-auth';
import { getJcbFleet } from '@/lib/integrations/jcb/client';
import { getTrackunitFleet } from '@/lib/integrations/trackunit/client';
import { linkMachines } from '@/lib/integrations/jcb/normalize';
import { linkTrackunitMachines } from '@/lib/integrations/trackunit/normalize';
import { trackingSnapshot, type TrackingSource } from '@/lib/integrations/roam/tracking';
import type { RegistryMachine, LinkedJcbMachine } from '@/lib/integrations/jcb/types';
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
export async function GET(request:NextRequest) {
  if (!authorizeRicoFleetFeed(request.headers.get('authorization'),process.env.ROAM_TRACKING_FEED_TOKEN||'',process.env.ROAM_TRACKING_FEED_TOKEN_PREVIOUS||'')) return json({error:'Authentication required.'},401);
  if (process.env.ROAM_TRACKING_ENABLED!=='true') return json({error:'Tracking feed is not enabled.'},503);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.JCB_HEALTH_DATABASE_KEY;
  if (!url||!key) return json({error:'Tracking feed is not configured.'},503);
  try {
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    async function rows<T>(table:string,columns:string,order:string):Promise<T[]> {
      const all:T[]=[];
      for(let offset=0;offset<50000;offset+=500){
        let query=db.from(table).select(columns);
        for(const key of order.split(','))query=query.order(key);
        const r=await query.range(offset,offset+499);
        if(r.error)throw Error('Registry unavailable');
        const batch=r.data as unknown as T[];all.push(...batch);
        if(batch.length<500)return all;
      }
      throw Error('Registry exceeded supported size');
    }
    const [registry,owned,jcbMappings,trackMappings]=await Promise.all([
      rows<RegistryMachine&{lifecycle_status:string}>('machines','id,machine_number,serial_number,make,model,lifecycle_status','id'),
      rows<{machine_id:string}>('customer_fleet_machines','machine_id,fleet_id','machine_id,fleet_id'),
      rows<{pin:string;machine_id:string}>('jcb_livelink_mappings','pin,machine_id','pin'),
      rows<{pin:string;machine_id:string}>('trackunit_mappings','pin,machine_id','pin'),
    ]);
    const customerIds=new Set(owned.map(m=>m.machine_id));
    const allowed=new Set(registry.filter(m=>m.lifecycle_status==='active'&&!customerIds.has(m.id)).map(m=>m.id));
    const results=await Promise.allSettled([
      (async()=>{if(process.env.JCB_LIVELINK_ENABLED!=='true')throw Error();const f=await getJcbFleet();return {machines:linkMachines(f.machines,registry,jcbMappings),checkedAt:f.checkedAt};})(),
      (async()=>{if(process.env.TRACKUNIT_ENABLED!=='true')throw Error();const f=await getTrackunitFleet();return {machines:linkTrackunitMachines(f.machines,registry,trackMappings),checkedAt:f.checkedAt};})(),
    ]);
    const groups=results.map((r,i):{source:TrackingSource;machines:LinkedJcbMachine[]}=>({source:{provider:i===0?'jcb':'trackunit',available:r.status==='fulfilled',checked_at:r.status==='fulfilled'?r.value.checkedAt:null},machines:r.status==='fulfilled'?r.value.machines:[]}));
    return json(trackingSnapshot(groups,allowed),results.every(r=>r.status==='rejected')?503:200);
  }catch{return json({error:'Unable to verify fleet ownership. Tracking feed unavailable.'},503);}
}
