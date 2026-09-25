import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {collectCycle,streamRequest,StreamError} from '@/lib/integrations/assetcare/stream';
import {normalizeAssetCare,combineFleet,linkAssetCare} from '@/lib/integrations/assetcare/normalize';
const at='2026-09-25T09:00:00Z',now=Date.parse(at);
const row={type:'telemetry',owner:{id:'MLP'},asset:{id:'A',name:'100'},date:at,location:{lat:52,lon:1,age:0},active:true,telemetry:{ignition:1},counters:{hours:20}};
it('projects only the selected owner, valid coordinates and dated readings without equating ignition to running',()=>{const m=normalizeAssetCare(row,'MLP',now)!;expect(m.machine.position?.latitude).toBe(52);expect(m.machine.engine).toBeNull();expect(m.machine.hours?.value).toBe(20);expect(normalizeAssetCare(row,'OTHER',now)).toBeNull();expect(normalizeAssetCare({...row,location:{lat:100,lon:1}},'MLP',now)?.machine.position).toBeNull();expect(normalizeAssetCare({...row,date:'invalid'},'MLP',now)).toBeNull();expect(normalizeAssetCare({...row,location:{lat:52,lon:1,age:10}},'MLP',now)?.machine.position?.at).toBeNull();});
it('persists every record, including unfamiliar types, before acknowledging; stops at its batch limit',async()=>{const order:string[]=[],items=[row,{type:'new-provider-type'}];const poll=vi.fn(async(_key:string,id?:string)=>{order.push(id?'delete':'get');return id?null:{id:'receipt',items};});const r=await collectCycle({key:'test',ownerId:'MLP',now:()=>now,maxBatches:1,poll,save:async(_hash,saved,assets)=>{expect(saved).toEqual(items);expect(assets).toHaveLength(1);order.push('durable');},acknowledged:async()=>{order.push('ack');}});expect(order).toEqual(['get','durable','delete','ack']);expect(r).toEqual({batches:1,records:2,drained:false,latestReceivedAt:null});});
it('does not acknowledge failed storage',async()=>{const poll=vi.fn().mockResolvedValue({id:'receipt',items:[row]});await expect(collectCycle({key:'test',ownerId:'MLP',poll,save:async()=>{throw Error('db failed');},acknowledged:vi.fn()})).rejects.toThrow('db failed');expect(poll).toHaveBeenCalledTimes(1);});
it('leaves failed acknowledgements retryable',async()=>{const poll=vi.fn().mockResolvedValueOnce({id:'receipt',items:[row]}).mockRejectedValueOnce(new StreamError(503)),ack=vi.fn(),save=vi.fn();await expect(collectCycle({key:'test',ownerId:'MLP',poll,save,acknowledged:ack})).rejects.toThrow();expect(save).toHaveBeenCalledTimes(1);expect(ack).not.toHaveBeenCalled();});
it('empty queue ends the cycle without deleting',async()=>{const poll=vi.fn().mockResolvedValue({id:null,items:[]});expect((await collectCycle({key:'test',ownerId:'MLP',poll,save:vi.fn(),acknowledged:vi.fn()})).drained).toBe(true);expect(poll).toHaveBeenCalledTimes(1);});
it('uses a header, refuses redirects, closes responses and enforces provider pauses',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],id:null})));await streamRequest('private-test-value',undefined,fetcher);expect(fetcher.mock.calls[0][0]).not.toContain('private-test-value');expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{'x-access-token':'private-test-value'}});expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);fetcher.mockResolvedValue(new Response('',{status:429,headers:{'Retry-After':'900'}}));await expect(streamRequest('private-test-value',undefined,fetcher)).rejects.toMatchObject({status:429,retryAfter:900});});
it('rejects malformed batches rather than acknowledging missing data',async()=>{await expect(streamRequest('test',undefined,vi.fn().mockResolvedValue(new Response('{"items":[{}],"id":null}')))).rejects.toThrow();});
it('keeps manufacturer feed once when multiple trackers link to one RELAY asset',()=>{const m=normalizeAssetCare(row,'MLP',now)!.machine,relay={id:'relay',machine_number:'100',make:'JCB',model:null,serial_number:null};const result=combineFleet([{...m,relay},{...m,source:'jcb',relay}]);expect(result).toHaveLength(1);expect(result[0].source).toBe('jcb');});

it('links an explicit fleet-number prefix and preserves historical provider time',()=>{
 const sample={...row,asset:{id:'asset-uuid',name:'25600 - 6T Mecalac Dumper'},origin:{id:'tracker-uuid'},date:'2026-01-19T10:37:53.000Z',received:'2026-01-19T10:37:55.000Z',location:{lat:52.067818,lon:-.636815,age:0},counters:{hours:42.230746}};
 const machine=normalizeAssetCare(sample,'MLP',now)!.machine;
 const registry=[{id:'relay-25600',machine_number:'25600',serial_number:null,make:'Mecalac',model:'6T'}];
 expect(machine.pin).toBe('asset-uuid');expect(machine.position?.at).toBe(sample.date);expect(machine.hours?.value).toBe(42.230746);expect(machine.engine).toBeNull();expect(linkAssetCare(machine,registry).relay?.id).toBe('relay-25600');
 expect(linkAssetCare(machine,[...registry,{...registry[0],id:'duplicate'}]).match).toBe('ambiguous');
 for(const name of ['125600 - Other','Vehicle 25600','AB25 XYZ - Driver','25600A - Other'])expect(linkAssetCare({...machine,equipmentId:name},registry).relay).toBeNull();
});


it('uses RELAY identity for a unique Asset Care match without changing provider identity or readings',async()=>{
 const {machineBrand,machineProvider,partsRequestUrl}=await import('@/lib/integrations/jcb/types');
 const {filterFleet,defaults}=await import('@/lib/fleet-map/preferences');
 const snapshot=normalizeAssetCare({...row,asset:{id:'tracker-26405',name:'26405 - XCMG XE135'},assetType:{name:'Vehicle'}},'MLP',now)!.machine;
 const record={id:'relay-26405',machine_number:'26405',make:'XCMG',model:'XE135E EXCAVATOR BLADED',serial_number:'XUGB1355CTKA00163'};
 const linked=linkAssetCare(snapshot,[record]);
 expect(linked.model).toBe(record.model);expect(machineBrand(linked)).toBe('XCMG');expect(machineProvider(linked)).toBe('Asset Care+');
 expect(linked.source).toBe('assetcare');expect(linked.pin).toBe(snapshot.pin);expect(linked.equipmentId).toBe(snapshot.equipmentId);expect(linked.position).toEqual(snapshot.position);expect(snapshot.model).toBe('Vehicle');
 expect(partsRequestUrl(linked)).toContain('machineReference=26405');expect(filterFleet([linked],defaults,'XE135E',{},now)).toHaveLength(1);
 expect(filterFleet([{...linked,equipmentId:'26405'}],defaults,'XCMG',{},now)).toHaveLength(1);
 const ambiguous=linkAssetCare(snapshot,[record,{...record,id:'duplicate'}]);expect(ambiguous.model).toBe('Vehicle');expect(machineBrand(ambiguous)).toBe('Asset Care+');expect(ambiguous.relay).toBeNull();
 const incomplete=linkAssetCare(snapshot,[{...record,make:' ',model:null}]);expect(incomplete.model).toBe('Vehicle');expect(machineBrand(incomplete)).toBe('Asset Care+');
});

it('paces backlog batches, caps requests and records durable progress',async()=>{
 const poll=vi.fn(async(_key:string,id?:string)=>id?null:{id:'r',items:[{...row,received:at}]}),sleep=vi.fn(),ack=vi.fn();
 const result=await collectCycle({key:'test',ownerId:'MLP',now:()=>now,maxBatches:999,poll,sleep,save:vi.fn(),acknowledged:ack});
 expect(result).toMatchObject({batches:40,drained:false,latestReceivedAt:at});expect(poll).toHaveBeenCalledTimes(80);expect(sleep).toHaveBeenCalledTimes(39);expect(sleep).toHaveBeenCalledWith(500);expect(ack).toHaveBeenLastCalledWith(result);
});
it('does not start another long poll when the remaining time is reserved for safe completion',async()=>{
 let time=now;const poll=vi.fn(async(_key:string,id?:string)=>{if(!id)time+=36000;return id?null:{id:'r',items:[row]};});
 const result=await collectCycle({key:'test',ownerId:'MLP',now:()=>time,poll,sleep:vi.fn(),save:vi.fn(),acknowledged:vi.fn()});expect(result.batches).toBe(1);expect(poll).toHaveBeenCalledTimes(2);
});
it('does not shorten a provider pause longer than a day',async()=>{await expect(streamRequest('test',undefined,vi.fn().mockResolvedValue(new Response('',{status:429,headers:{'Retry-After':'172800'}})))).rejects.toMatchObject({retryAfter:172800});});
