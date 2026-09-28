import type { NextRequest } from 'next/server';
import { authorizeAssets } from '@/lib/assets/access';
import { operationsDatabase, ownership } from '@/lib/fleet-operations/server';
import { getAssetCareFleet } from '@/lib/integrations/assetcare/server';
import { groupedFleet } from '@/lib/fleet-map/group-store';
import { jcbJson } from '@/lib/integrations/jcb/server';
import { JcbError } from '@/lib/integrations/jcb/client';
import { loadYardEvents } from '@/lib/yard-report';
import { plantBoardData } from '@/lib/plant-wallboard/model';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
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
    const data = plantBoardData(machines, owners.allowed, events, now);
    return jcbJson({ ...data, warning: assetcare?.stale ? 'Tracking collection is delayed. Some saved positions and movements may be behind.' : null });
  } catch (error) {
    return jcbJson({ error: error instanceof JcbError ? error.message : 'Plant wallboard could not refresh. Saved figures may be out of date.' }, error instanceof JcbError ? error.status : 503);
  }
}
