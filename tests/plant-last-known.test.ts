import {expect,it} from 'vitest';
import {lastKnownSide,stationaryAtBoundary,type BoardMachine} from '@/lib/plant-wallboard/positions';
import yard from '@/lib/fleet-operations/yard.json';
const now=Date.parse('2026-09-28T12:00:00Z'), at=(minutes:number)=>new Date(now-minutes*60000).toISOString();
const [longitude,latitude]=yard.geometry.coordinates[0][0];
const machine:BoardMachine={pin:'a',equipmentId:'a',model:'a',relay:null,match:'unmatched',position:{latitude,longitude,at:at(1)}};
it('includes a stationary yard-edge asset when two distinct GPS fixes agree',()=>{
 const m={...machine,positionHistory:[{latitude,longitude,at:at(6)}]};
 expect(stationaryAtBoundary(m,now)).toBe(true);expect(lastKnownSide(m,now)).toBe('off_hire');
});
it('does not treat missing motion evidence, repeated fixes, old fixes or ignition-off transport as stationary',()=>{
 for(const m of [machine,{...machine,ignition:{value:false,at:at(1)}},{...machine,positionHistory:[machine.position!]},{...machine,positionHistory:[{latitude,longitude,at:at(60)}]},{...machine,positionHistory:[{latitude:latitude+.001,longitude,at:at(6)}]},{...machine,positionHistory:[{latitude,longitude,at:at(6)}],transit:{at:at(1),metres:500,basis:'GPS movement' as const,provider:'assetcare'}}])expect(lastKnownSide(m,now)).toBe('unknown');
});
it('never reclassifies moving assets outside the boundary band as in yard',()=>{
 expect(lastKnownSide({...machine,position:{latitude:52,longitude:1,at:at(1)},positionHistory:[{latitude:52,longitude:1,at:at(6)}]},now)).toBe('on_hire');
});
