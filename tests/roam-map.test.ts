import {describe,it,expect} from 'vitest';
import fixture from './fixtures/roam-current-hires.json';
import {hirePageSchema} from '@/lib/integrations/roam/hires';
import {mergeRoamMap} from '@/lib/integrations/roam/map';
import {filterFleet,defaults} from '@/lib/fleet-map/preferences';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {projectMachine} from '@/lib/integrations/jcb/normalize';
const hire=()=>structuredClone(hirePageSchema.parse(fixture).items[0]);
const now=Date.parse('2026-09-30T12:00:00Z');
const tracked:LinkedJcbMachine={source:'jcb',pin:'TEST',equipmentId:'EXAMPLE-001',model:'Excavator',relay:null,match:'unmatched',position:{latitude:52,longitude:1,at:'2026-09-30T11:00:00Z'}};
describe('ROAM untracked hire map',()=>{
 it('plots an unlinked on-hire asset at its site without pretending it is GPS',()=>{const m=mergeRoamMap([],[hire()],now)[0];expect(m.source).toBe('roam');expect(m.equipmentId).toBe('EXAMPLE-001');expect(m.position).toEqual({latitude:52.399,longitude:.262,at:null});expect(filterFleet([m],{...defaults,status:'on_hire'},'',{},now)).toHaveLength(1)});
 it('matches exact normalised fleet numbers and uses recent tracker positions without duplicate pins',()=>{const h=hire();h.machine.fleet='example 001';const m=mergeRoamMap([tracked],[h],now);expect(m).toHaveLength(1);expect(m[0].source).toBe('jcb');expect(m[0].position).toEqual(tracked.position);expect(m[0].roamHire?.id).toBe(h.id)});
 it('uses delivery location if site coordinates are unavailable and never invents coordinates',()=>{const h=hire();h.site={name:'Site'};expect(mergeRoamMap([],[h],now)[0].roamHire?.locationType).toBe('delivery');h.delivery={};expect(mergeRoamMap([],[h],now)[0].position).toBeNull()});
 it('enriches stale, missing, and future-dated provider records without replacing their data',()=>{for(const position of [{...tracked.position!,at:'2026-01-01'},null,{...tracked.position!,at:'2027-01-01'}]){const provider={...tracked,position,hours:{value:321,at:'2026-01-01'},batteryVoltage:{value:12.8,at:'2026-01-01'}};const m=mergeRoamMap([provider],[hire()],now);expect(m).toHaveLength(1);expect(m[0]).toMatchObject(provider);expect(m[0].source).toBe('jcb');expect(m[0].pin).toBe('TEST');expect(m[0].roamHire?.id).toBe(hire().id)}});
 it('removes scheduled hires and deduplicates overlapping on-site hire records',()=>{const h=hire();expect(mergeRoamMap([],[{...h,status:'scheduled'}],now)).toHaveLength(0);expect(mergeRoamMap([],[h,{...h,id:'another'}],now)).toHaveLength(1)});
 it('does not match partial fleet numbers or ambiguous trackers',()=>{const h=hire();h.machine.fleet='EXAMPLE-00';expect(mergeRoamMap([tracked],[h],now)).toHaveLength(2);expect(mergeRoamMap([tracked,{...tracked,pin:'OTHER'}],[hire()],now).at(-1)?.source).toBe('roam')});
 it('keeps safe ROAM map metadata in non-admin projections',()=>{const m=mergeRoamMap([tracked],[hire()],now).find(row=>row.roamHire)!;expect(projectMachine(m,false).roamHire).toMatchObject({reference:'H-EXAMPLE-001',site:'Example construction site'});expect(projectMachine({...m,hours:{value:10,at:null}},false)).not.toHaveProperty('hours')});
});
