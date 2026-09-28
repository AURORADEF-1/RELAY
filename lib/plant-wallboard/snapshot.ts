import 'server-only';
import type { NextRequest } from 'next/server';
import { authorizeAssets } from '@/lib/assets/access';
import { operationsDatabase, ownership } from '@/lib/fleet-operations/server';
import { getAssetCareFleet } from '@/lib/integrations/assetcare/server';
import { groupedFleet } from '@/lib/fleet-map/group-store';
import { JcbError } from '@/lib/integrations/jcb/client';
import { loadYardEvents } from '@/lib/yard-report';
import { withPositionHistory } from '@/lib/plant-wallboard/history';
import { plantBoardData, plantPositions } from '@/lib/plant-wallboard/model';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';

export async function loadPlantSnapshot(request: NextRequest) {
  const auth = await authorizeAssets(request, true);
  const db = operationsDatabase(), now = Date.now();
  const [owners, latest, assetcare, events] = await Promise.all([
    ownership(db), db.rpc('fleet_operations_latest').limit(1000),
    process.env.ASSETCARE_ENABLED === 'true' ? getAssetCareFleet() : Promise.resolve(null),
    loadYardEvents(auth.supabase, now, request.signal),
  ]);
  if (latest.error || !Array.isArray(latest.data) || latest.data.length >= 1000) throw new JcbError('Plant tracking data is unavailable. Please retry.',503);
  const registry = new Map(owners.registry.map(m=>[m.id,m]));
  const manufacturer = latest.data.map((r: { machine_id: string; payload: LinkedJcbMachine })=>({ ...r.payload, relay: registry.get(r.machine_id) ?? null }));
  const machines = await groupedFleet([...manufacturer, ...(assetcare?.machines ?? [])]);
  const located = await withPositionHistory(db, machines.filter(m=>m.relay && owners.allowed.has(m.relay.id)), now);
  const data = plantBoardData(located, owners.allowed, events, now);
  return { data: { ...data, warning: assetcare?.stale ? 'Tracking collection is delayed. Some saved positions and movements may be behind.' : null }, positions: plantPositions(located,owners.allowed,now), machines: located, events, now };
}
