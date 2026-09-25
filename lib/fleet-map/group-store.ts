import 'server-only';
import {allRows,operationsDatabase} from '@/lib/fleet-operations/server';
import {applyAssetGroups,type AssetGroup} from './groups';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export async function groupedFleet(machines:LinkedJcbMachine[]){
 const groups=await allRows<AssetGroup>(operationsDatabase(),'fleet_asset_groups','lookup_hash,cost_centre,category','lookup_hash');
 return applyAssetGroups(machines,groups);
}
