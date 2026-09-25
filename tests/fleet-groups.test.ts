import {expect,it} from 'vitest';
import {assetGroupKeys,applyAssetGroups} from '@/lib/fleet-map/groups';
import {defaults,filterFleet,readPreferences} from '@/lib/fleet-map/preferences';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const machine:LinkedJcbMachine={source:'assetcare',pin:'test',equipmentId:'12345 - excavator',model:'Excavator',relay:null,match:'unmatched',position:null};
it('matches a renamed machine by fleet number and retains the imported group',()=>{
 const groups=assetGroupKeys('12345 - old name').map(lookup_hash=>({lookup_hash,cost_centre:'Plant',category:'Plant'}));
 expect(applyAssetGroups([machine],groups)[0]).toMatchObject({assetGroup:'Plant',assetCategory:'Plant'});
});
it('normalizes registrations, avoids ambiguous matches and preserves unknown classification',()=>{
 expect(assetGroupKeys(' AB12 CDE - Driver A ')[1]).toBe(assetGroupKeys('ab12cde - Driver B')[1]);
 const groups=[{lookup_hash:assetGroupKeys(machine.equipmentId)[0],cost_centre:'Stock',category:'Stock'},{lookup_hash:assetGroupKeys(machine.equipmentId)[1],cost_centre:'Plant',category:'Plant'}];
 expect(applyAssetGroups([machine],groups)[0]).toMatchObject({assetGroup:'Ungrouped',assetCategory:'Unclassified'});
 expect(assetGroupKeys('8.61327E+14')).toHaveLength(1);
});
it('combines group, type and brand filters without breaking saved older preferences',()=>{
 const m={...machine,assetGroup:'Plant',assetCategory:'Plant'};
 expect(readPreferences('{"yard":false}')).toMatchObject({brand:'all',category:'all',group:'all',yard:false});
 expect(filterFleet([m],{...defaults,brand:'UNKNOWN',category:'Plant',group:'Plant'},'',{})).toHaveLength(1);
 expect(filterFleet([m],{...defaults,group:'Stock'},'',{})).toHaveLength(0);
 expect(filterFleet([m],{...defaults,brand:'XCMG'},'',{})).toHaveLength(0);
});
