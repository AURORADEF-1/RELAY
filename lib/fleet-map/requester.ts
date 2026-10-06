import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {projectMachine} from '@/lib/integrations/jcb/normalize';
import {combineFleet} from '@/lib/integrations/assetcare/normalize';
import {applyAssetGroups,assetGroupKeys,type AssetGroup} from './groups';

// Classify before deduplication: a People alias must never disappear behind a
// manufacturer record for the same asset. Conflicting People matches also deny.
export function requesterMachines(machines:LinkedJcbMachine[],groups:AssetGroup[]){
 const peopleKeys=new Set(groups.filter(g=>g.category?.trim().toLowerCase()==='people').map(g=>g.lookup_hash));
 const keys=(m:LinkedJcbMachine)=>[...assetGroupKeys(m.equipmentId),...(m.relay?assetGroupKeys(m.relay.machine_number):[])];
 const identities=(m:LinkedJcbMachine)=>[`${m.source}:${m.pin}`,...keys(m),...(m.relay?[`relay:${m.relay.id}`]:[])];
 const blocked=new Set<string>();
 for(const m of machines)if(keys(m).some(k=>peopleKeys.has(k))||m.assetCategory?.toLowerCase()==='people')identities(m).forEach(k=>blocked.add(k));
 // Propagate through aliases until no more identities can be linked.
 let changed=true;
 while(changed){changed=false;for(const m of machines)if(identities(m).some(k=>blocked.has(k)))for(const k of identities(m))if(!blocked.has(k)){blocked.add(k);changed=true;}}
 const classified=applyAssetGroups(machines,groups).filter(m=>!identities(m).some(k=>blocked.has(k))&&m.assetCategory!=='Unclassified');
 return combineFleet(classified).map(m=>({...projectMachine(m,false),assetGroup:m.assetGroup,assetCategory:m.assetCategory}));
}
