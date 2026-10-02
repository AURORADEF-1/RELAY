import 'server-only';
import type { NextRequest } from 'next/server';
import { authorizeAssets } from '@/lib/assets/access';
import { operationsDatabase, ownership } from '@/lib/fleet-operations/server';
import { getAssetCareFleet } from '@/lib/integrations/assetcare/server';
import { groupedFleet } from '@/lib/fleet-map/group-store';
import { JcbError } from '@/lib/integrations/jcb/client';
import { reconcilePlantHistory, type YardTimeline } from './timeline';
import { withPositionHistory } from '@/lib/plant-wallboard/history';
import { plantBoardData, plantPositions } from '@/lib/plant-wallboard/model';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';

export async function loadPlantSnapshot(request: NextRequest) {
  await authorizeAssets(request, true);
  const db = operationsDatabase(), now = Date.now();
  const [owners, latest, assetcare] = await Promise.all([
    ownership(db), db.rpc('fleet_operations_latest').limit(1000),
    process.env.ASSETCARE_ENABLED === 'true' ? getAssetCareFleet() : Promise.resolve(null),
  ]);
  if (latest.error || !Array.isArray(latest.data) || latest.data.length >= 1000) throw new JcbError('Plant tracking data is unavailable. Please retry.',503);
  const registry = new Map(owners.registry.map(m=>[m.id,m]));
  const manufacturer = latest.data.map((r: { machine_id: string; payload: LinkedJcbMachine })=>({ ...r.payload, relay: registry.get(r.machine_id) ?? null }));
  const machines = await groupedFleet([...manufacturer, ...(assetcare?.machines ?? [])]);
  const eligible = machines.filter(m=>m.relay && owners.allowed.has(m.relay.id));
  const keys = eligible.filter(m=>m.assetCategory==='Plant').map(m=>({provider:m.source??'jcb',pin:m.pin}));
  const timelines:YardTimeline[]=[];
  // Stay below the database API row cap; never silently truncate trackers.
  for(let offset=0;offset<keys.length;offset+=200){
    const history=await db.rpc('plant_yard_timeline',{p_keys:keys.slice(offset,offset+200),p_to:new Date(now).toISOString()});
    if(history.error || !Array.isArray(history.data)) throw new JcbError('Yard movement history is unavailable. Please retry.',503);
    timelines.push(...history.data as YardTimeline[]);
  }
  if(keys.length && !timelines.length)throw new JcbError('Yard history is still being prepared. Please retry.',503);
  const reconciled = reconcilePlantHistory(eligible,timelines,now);
  reconciled.machines=await withPositionHistory(db,reconciled.machines,now);
  const events = reconciled.events;
  const data = plantBoardData(reconciled.machines, owners.allowed, events, now);
  return { data: { ...data, warning: assetcare?.stale ? 'Tracking collection is delayed. Some saved positions and movements may be behind.' : null }, positions: plantPositions(reconciled.machines,owners.allowed,now), machines: reconciled.machines, events, now };
}
