import {expect,it} from 'vitest';
import {detectTransit,currentTransit} from '@/lib/assets/transit';
import {normalizeAssetCare,combineFleet} from '@/lib/integrations/assetcare/normalize';
import {projectYardInbox} from '@/lib/integrations/assetcare/yard-inbox';
import {cardStatus} from '@/lib/assets/card-status';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-25T12:00:00Z'),at='2026-09-25T12:00:00Z',before='2026-09-25T11:55:00Z';
const m:LinkedJcbMachine={source:'assetcare',pin:'a',equipmentId:'100',model:'Excavator',relay:null,match:'unmatched',position:{latitude:52,longitude:1,at},ignition:{value:false,at},odometer:{value:101,at}};
const prev={...m,position:{...m.position!,longitude:0.99,at:before},ignition:{value:false,at:before},odometer:{value:100,at:before}};
it('detects dated travel while ignition is explicitly off',()=>{expect(detectTransit(m,prev,now)).toMatchObject({metres:1000,basis:'Distance counter'});expect(detectTransit({...m,odometer:null},prev,now)?.basis).toBe('GPS movement');});
it('rejects unknown/on ignition, engine-only status, stale, same-time and implausible movement',()=>{
 for(const candidate of [{...m,ignition:null,engine:{value:false,at}},{...m,ignition:{value:true,at}},prev,{...m,odometer:{value:10000,at},position:{...m.position!,longitude:30}}])expect(detectTransit(candidate,prev,now)).toBeNull();
 expect(detectTransit(m,prev,now+31*60000)).toBeNull();expect(detectTransit(m,{...prev,ignition:{value:true,at:before}},now)).toBeNull();
});
it('ignores GPS drift and a decreasing/reset distance counter',()=>{expect(detectTransit({...m,position:{...prev.position!,at},odometer:{value:1,at}},prev,now)).toBeNull();});
it('expires transit and retains fault prominence',()=>{const transit=detectTransit(m,prev,now),machine={...m,transit};expect(currentTransit(machine,now+31*60000)).toBeNull();expect(cardStatus(machine,null,null,now).label).toBe('In transit');expect(cardStatus(machine,{faults:[{code:'E1',at,description:'Fault',severity:'Warning'}],checkedAt:at},null,now)).toMatchObject({tone:'fault',transit:'In transit'});});
it('preserves explicit ignition without equating ignition-on to engine-running',()=>{const row={type:'telemetry',owner:{id:'owner'},asset:{id:'a',name:'100'},date:at,location:{lat:52,lon:1},telemetry:{ignition:0,odometer:101}};expect(normalizeAssetCare(row,'owner',now)?.machine).toMatchObject({ignition:{value:false,at},odometer:{value:101,at},engine:null});const assets=projectYardInbox([row],'owner',[{asset_id:'a',machine:prev}],[],new Set(),now);expect(assets[0].machine.transit?.metres).toBe(1000);});
it('carries transit across duplicate tracker feeds only for the same linked machine',()=>{const relay={id:'id',machine_number:'100',make:'JCB',model:null,serial_number:null},transit=detectTransit(m,prev,now);expect(combineFleet([{...m,source:'jcb',relay},{...m,relay,transit}])[0].transit).toEqual(transit);});
