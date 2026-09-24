import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {positionSide,hireState,operationalReport,csvCell,DAY,type Snapshot} from '@/lib/fleet-operations/report';
import {eligibleMachines} from '@/lib/fleet-operations/server';
import {normalizeEquipment} from '@/lib/integrations/jcb/normalize';
import {applyTelemetry} from '@/lib/integrations/trackunit/normalize';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-24T12:00:00Z');
const machine:LinkedJcbMachine={pin:'test',equipmentId:'DEMO',model:'Test',position:null,relay:{id:'a',machine_number:'DEMO',make:'JCB',model:'Test',serial_number:'test'},match:'exact'};
function sample(at:number,fuel:number,hours:number,idle:number,lat=52.3925,lon=.955){const date=new Date(at).toISOString();return {captured_at:date,payload:{...machine,position:{latitude:lat,longitude:lon,at:date},fuelUsed:{value:fuel,at:date},hours:{value:hours,at:date},idleHours:{value:idle,at:date}}} satisfies Snapshot;}
describe('Fleet Operations reporting',()=>{
 it('uses the actual yard polygon and rejects stale/future/invalid positions',()=>{const p=sample(now,0,0,0).payload.position;expect(positionSide(p,now)).toBe('off_hire');expect(positionSide({...p,latitude:52.4},now)).toBe('on_hire');expect(positionSide(p,now+DAY+1)).toBe('unknown');expect(positionSide(p,now-1)).toBe('unknown');expect(positionSide({...p,longitude:NaN},now)).toBe('unknown');expect(positionSide({...p,longitude:.9569907,latitude:52.3930541},now)).toBe('unknown');});
 it('classifies initial GPS immediately and requires distinct reports for crossings',()=>{const a=sample(now-3600000,0,0,0),b=sample(now,0,0,0);expect(hireState([a,a],now).status).toBe('off_hire');expect(hireState([a,b],now).status).toBe('off_hire');const out=sample(now+1000,0,0,0,52.4);expect(hireState([a,b,out],now+1000)).toMatchObject({status:'unknown',lastKnown:'off_hire'});expect(hireState([a,b],now+DAY+1).status).toBe('unknown');});
 it('confirms crossings only with a new timestamp and clears a cancelled crossing',()=>{const a=sample(now-3000,0,0,0),b=sample(now-2000,0,0,0,52.4),c=sample(now-1000,0,0,0,52.4);expect(hireState([a,b,b],now)).toMatchObject({status:'unknown',state:'crossing',lastKnown:'off_hire'});expect(hireState([a,b,c],now)).toMatchObject({status:'on_hire',state:'current'});expect(hireState([a,b,sample(now,0,0,0)],now).status).toBe('off_hire');expect(hireState([c],now).status).toBe('on_hire');});
 it('distinguishes stale, missing, invalid and boundary GPS from loading',()=>{const a=sample(now,0,0,0);expect(hireState([a],now+DAY+1).state).toBe('stale');expect(hireState([{...a,payload:{...a.payload,position:null}}],now).state).toBe('missing');expect(hireState([sample(now+1,0,0,0)],now).state).toBe('invalid');expect(hireState([sample(now,0,0,0,52.3930541,.9569907)],now).state).toBe('boundary');});
 it('calculates aligned meter changes and distinguishes true zero from missing',()=>{const result=operationalReport([sample(now-3600000,100,10,4),sample(now,108,11,4.25)],now-DAY,now);expect(result).toMatchObject({fuelLitres:8,engineHours:1,idleHours:.25,litresPerHour:8,idlePercent:25,nonIdleHours:.75,yardFuel:8,unattributedFuel:0});expect(operationalReport([sample(now,100,10,4)],now-DAY,now).fuelLitres).toBeNull();expect(operationalReport([sample(now-3600000,100,10,4),sample(now,100,10,4)],now-DAY,now).fuelLitres).toBe(0);});
 it('excludes reset counters, long gaps, future data and periods spanning report start',()=>{expect(operationalReport([sample(now-3600000,100,10,4),sample(now,5,1,0)],now-DAY,now).fuelLitres).toBeNull();expect(operationalReport([sample(now-3*DAY,100,10,4),sample(now,108,11,4)],now-4*DAY,now).fuelLitres).toBeNull();expect(operationalReport([sample(now-3600000,100,10,4),sample(now+1,108,11,4)],now-DAY,now).fuelLitres).toBeNull();expect(operationalReport([sample(now-3600000,100,10,4),sample(now,108,11,4)],now-1000,now).fuelLitres).toBeNull();});
 it('does not allocate crossings to the machines current side or misaligned rates',()=>{const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25,52.4);b.payload.hours.at=new Date(now-60000).toISOString();expect(operationalReport([a,b],now-DAY,now)).toMatchObject({fuelLitres:8,unattributedFuel:8,yardFuel:0,onHireFuel:0,litresPerHour:null,idlePercent:null});});
 it('excludes customer/inactive/unmatched and duplicate provider identities using verified ownership',()=>{expect(eligibleMachines([machine,{...machine,pin:'other',relay:{...machine.relay!,id:'b'}},{...machine,pin:'unmatched',relay:null}],new Set(['a']))).toEqual([machine]);expect(eligibleMachines([machine,{...machine,source:'trackunit'}],new Set(['a']))).toEqual([]);});
 it('does not accept fuel percentages or ambiguous gallons as litres',()=>{const raw={EquipmentHeader:{Pin:'test'},FuelUsed:{FuelConsumed:123,FuelUnits:'litre',DateTime:new Date(now).toISOString()}};expect(normalizeEquipment(raw).fuelUsed?.value).toBe(123);expect(normalizeEquipment({...raw,FuelUsed:{...raw.FuelUsed,FuelUnits:'gallon'}}).fuelUsed).toBeNull();const telemetry=[{name:'Total Fuel Used',value:123,time:new Date(now).toISOString(),uoM:'L'}];expect(applyTelemetry(machine,telemetry).fuelUsed?.value).toBe(123);expect(applyTelemetry(machine,[{...telemetry[0],uoM:'%'}]).fuelUsed).toBeNull();});
 it('neutralizes CSV formulas and escapes quoted fields',()=>{expect(csvCell('=cmd()')).toBe('"\'=cmd()"');expect(csvCell('A"B')).toBe('"A""B"');expect(csvCell(null)).toBe('""');});
});

describe('Fuel location timing and uncertainty',()=>{
 it('labels bounded GPS/counter timing differences as estimates without changing measured fuel',()=>{
  const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25);
  a.payload.position.at=new Date(now-3600000+5*60000).toISOString();b.payload.position.at=new Date(now-5*60000).toISOString();
  expect(operationalReport([a,b],now-DAY,now)).toMatchObject({fuelLitres:8,yardFuel:8,unattributedFuel:0,timingEstimatedFuel:8});
 });
 it('keeps missing opening history unconfirmed instead of applying the current location',()=>{
  const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25);a.payload.position.at=new Date(now-30*60000).toISOString();
  expect(operationalReport([a,b],now-DAY,now)).toMatchObject({unattributedFuel:8,timingEstimatedFuel:0,unattributedReasons:{missingStart:8}});
 });
 it('does not estimate a crossing even when timestamps are close',()=>{
  const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25,52.4);a.payload.position.at=new Date(now-55*60000).toISOString();b.payload.position.at=new Date(now-5*60000).toISOString();
  expect(operationalReport([a,b],now-DAY,now)).toMatchObject({unattributedFuel:8,timingEstimatedFuel:0,unattributedReasons:{crossing:8}});
 });
 it('does not let repeated GPS observations cover an entire interval or use future observations',()=>{
  const a=sample(now-10*60000,100,10,4),b=sample(now,108,11,4.25);a.payload.position.at=b.payload.position.at=new Date(now-5*60000).toISOString();
  expect(operationalReport([a,b],now-DAY,now).unattributedFuel).toBe(8);
  b.payload.position.at=new Date(now+60000).toISOString();expect(operationalReport([a,b],now-DAY,now).unattributedFuel).toBe(8);
 });
 it('accounts for every unconfirmed litre and retains long-gap protection',()=>{
  const result=operationalReport([sample(now-3*3600000,100,10,4),sample(now,108,11,4.25)],now-DAY,now);
  expect(result.unattributedReasons.gpsGap).toBe(8);expect(Object.values(result.unattributedReasons).reduce((a,b)=>a+b,0)).toBe(result.unattributedFuel);
 });
});

it('optionally estimates missing historical GPS from last known status without changing fuel totals',()=>{
 const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25,52.4);
 a.payload.position=b.payload.position;
 const result=operationalReport([a,b],now-DAY,now,{estimateFromLastKnown:true});
 expect(result).toMatchObject({fuelLitres:8,onHireFuel:8,yardFuel:0,statusEstimatedFuel:8,unattributedFuel:0});
});
it('labels crossing allocations as estimates and preserves no-location fuel for attention',()=>{
 const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25,52.4);
 expect(operationalReport([a,b],now-DAY,now,{estimateFromLastKnown:true})).toMatchObject({onHireFuel:8,statusEstimatedFuel:8,unattributedFuel:0});
 const missing=[a,b].map(s=>({...s,payload:{...s.payload,position:null}}));
 expect(operationalReport(missing,now-DAY,now,{estimateFromLastKnown:true})).toMatchObject({fuelLitres:8,statusEstimatedFuel:0,unattributedFuel:8});
});
it('never uses future GPS to estimate fuel allocation',()=>{
 const a=sample(now-3600000,100,10,4),b=sample(now,108,11,4.25);
 a.payload.position.at=b.payload.position.at=new Date(now+60000).toISOString();
 expect(operationalReport([a,b],now-DAY,now,{estimateFromLastKnown:true})).toMatchObject({unattributedFuel:8,statusEstimatedFuel:0});
});
