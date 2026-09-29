import {describe,it,expect} from 'vitest';
import {filterFleet,defaults} from '@/lib/fleet-map/preferences';
import {machineKey,machineProvider,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const test:LinkedJcbMachine={source:'signwatch',pin:'sign-watch-test',equipmentId:'Test',model:'',position:{latitude:52,longitude:1,at:new Date().toISOString()},relay:null,match:'confirmed',assetCategory:'Sign Watch',assetGroup:'Sign Watch'};
describe('Sign Watch map category',()=>{
 it('includes Test in the default map and named category',()=>{expect(filterFleet([test],defaults,'',{})).toEqual([test]);expect(filterFleet([test],{...defaults,category:'Sign Watch'},'Test',{})).toEqual([test]);});
 it('keeps the Sign Watch provider distinct from plant providers',()=>{expect(machineKey(test)).toBe('signwatch:sign-watch-test');expect(machineProvider(test)).toBe('Sign Watch');expect(filterFleet([test],{...defaults,providers:['jcb']},'',{})).toEqual([]);});
});
