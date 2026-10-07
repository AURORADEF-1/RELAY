import 'server-only';
import {allRows,operationsDatabase} from '@/lib/fleet-operations/server';
import {applyAssetGroups,type AssetGroup} from './groups';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import type {SupabaseClient} from '@supabase/supabase-js';
import importedCostCentres from '@/data/fleet-cost-centres.json';
import costCentreOverrides from '@/data/fleet-cost-centre-overrides.json';
export async function fleetGroups(db:SupabaseClient=operationsDatabase()){
 const groups=await allRows<AssetGroup>(db,'fleet_asset_groups','lookup_hash,cost_centre,category','lookup_hash');
 const imported=Object.entries({...importedCostCentres,...costCentreOverrides}).map(([lookup_hash,cost_centre])=>({lookup_hash,cost_centre}));
 const byKey=new Map(groups.map(group=>[group.lookup_hash,group]));
 imported.forEach(group=>byKey.set(group.lookup_hash,group));
 return [...byKey.values()];
}
export async function groupedFleet(machines:LinkedJcbMachine[]){
 return applyAssetGroups(machines,await fleetGroups());
}
