import {expect,it} from 'vitest';
import {readPreferences,defaults,filterFleet} from '@/lib/fleet-map/preferences';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const m:LinkedJcbMachine={source:'assetcare',pin:'a',equipmentId:'van',model:'Vehicle',relay:null,match:'unmatched',position:{latitude:52,longitude:1,at:'2026-09-25T08:00:00Z'}};
it('keeps explicit all-off checkboxes and rejects corrupt preferences',()=>{expect(readPreferences('{"providers":[]}').providers).toEqual([]);expect(readPreferences('bad')).toEqual(defaults);expect(readPreferences('{"providers":["assetcare","invalid"],"base":"invalid"}')).toMatchObject({providers:['assetcare'],base:'map'});});
it('filters provider, search, missing GPS and age without treating stale data as fresh',()=>{const now=Date.parse('2026-09-25T09:00:00Z');expect(filterFleet([m],defaults,'VAN',{},now)).toHaveLength(1);expect(filterFleet([m],{...defaults,providers:['jcb']},'',{},now)).toHaveLength(0);expect(filterFleet([m],{...defaults,freshness:'old'},'',{},now)).toHaveLength(0);expect(filterFleet([m],{...defaults,freshness:'old'},'',{},now+86400000)).toHaveLength(1);expect(filterFleet([{...m,position:null}],{...defaults,freshness:'missing'},'',{},now)).toHaveLength(1);});
it('never includes missing assessments in running or faults filters',()=>{expect(filterFleet([m],{...defaults,status:'running'},'',{})).toHaveLength(0);expect(filterFleet([m],{...defaults,status:'fault'},'',{})).toHaveLength(0);});

it('filters on actual ROAM machine IDs, retaining unpositioned hires and applying other filters',()=>{
 const hired={...m,relay:{id:'hired',machine_number:'100'},position:null} as LinkedJcbMachine;
 const other={...m,relay:{id:'other',machine_number:'200'}} as LinkedJcbMachine;
 const prefs={...defaults,status:'on_hire' as const};
 expect(readPreferences('{"status":"on_hire"}').status).toBe('on_hire');
 expect(filterFleet([hired,other,m],prefs,'',{},Date.now(),new Set(['hired']))).toEqual([hired]);
 expect(filterFleet([hired,other],prefs,'',{})).toEqual([]);
 expect(filterFleet([hired],{...prefs,providers:['jcb']},'',{},Date.now(),new Set(['hired']))).toEqual([]);
 expect(filterFleet([hired],{...prefs,freshness:'fresh'},'',{},Date.now(),new Set(['hired']))).toEqual([]);
});
