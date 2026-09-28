import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {groupedFleet} from '@/lib/fleet-map/group-store';
import {allRows,operationsDatabase} from '@/lib/fleet-operations/server';
import type {SavedAsset} from '@/lib/integrations/assetcare/yard-inbox';
import {staffRow} from '@/lib/staff/model';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const [fleet,history]=await Promise.all([getAssetCareFleet(),allRows<SavedAsset>(operationsDatabase(),'assetcare_assets','asset_id,position_history','asset_id')]);
 const machines=await groupedFleet(fleet.machines),now=Date.now(),byId=new Map(history.map(h=>[h.asset_id,h.position_history??[]]));
 return jcbJson({rows:machines.filter(m=>m.assetCategory==='People').map(m=>staffRow(m,byId.get(m.pin)??[],now)).sort((a,b)=>a.label.localeCompare(b.label)),checkedAt:new Date(now).toISOString(),warning:fleet.stale?'Tracking collection needs attention. Check each vehicle GPS timestamp.':null});
 }catch(e){return jcbError(e);}}
