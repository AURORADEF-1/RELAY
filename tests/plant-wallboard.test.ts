import { describe, expect, it } from 'vitest';
import { boardSlide, plantBoardData, plantPeriodStarts, plantPositions } from '@/lib/plant-wallboard/model';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';
import type { YardEvent } from '@/lib/yard-report';
const now = Date.parse('2026-09-28T12:00:00Z');
const at = (hours: number) => new Date(now + hours*3600000).toISOString();
const inside = { latitude:52.392, longitude:.955, at:at(-1) };
const outside = { latitude:52, longitude:1, at:at(-1) };
function machine(id:string, position: LinkedJcbMachine['position']=inside, category='Plant'): LinkedJcbMachine {
  return {pin:id,equipmentId:id,model:'Excavator',position,source:'jcb',assetCategory:category,match:'exact',relay:{id,machine_number:id,make:'JCB',model:'Excavator',serial_number:null}};
}
function event(id:string,machine_id:string,kind:YardEvent['kind'],time:string): YardEvent { return {id,machine_id,kind,occurred_at:time,provider:'jcb',machine:{machine_number:machine_id,make:'JCB',model:'Excavator'}}; }
describe('director plant overview',()=>{
 it('counts each active owned machine once using its latest valid GPS',()=>{
  const result=plantPositions([machine('a',inside),{...machine('a',{...outside,at:at(-.5)}),source:'assetcare'},machine('b',inside),machine('c',outside)],new Set(['a','b']),now);
  expect(result).toHaveLength(2);expect(result.find(r=>r.id==='a')?.status).toBe('out');expect(result.find(r=>r.id==='b')?.status).toBe('yard');
 });
 it('excludes people, vehicles, unclassified assets, unmatched identities and conflicting classifications',()=>{
  const m=[machine('staff',inside,'People'),machine('van',inside,'Vehicles'),machine('unknown',inside,'Unclassified'),{...machine('orphan'),relay:null},machine('mixed'),machine('mixed',inside,'People')];
  expect(plantPositions(m,new Set(m.map(r=>r.pin)),now)).toEqual([]);
 });
 it('keeps missing, invalid and conflicting GPS in the unclear count',()=>{
  const m=[machine('missing',null),machine('future',{...inside,at:at(1)}),machine('zero',{latitude:0,longitude:0,at:at(-1)}),machine('conflict',inside),machine('conflict',outside)];
  expect(plantPositions(m,new Set(m.map(r=>r.pin)),now).every(r=>r.status==='unknown')).toBe(true);
 });
 it('uses old and undated coordinates while keeping their freshness explicit',()=>{
  const result=plantPositions([machine('old',{...inside,at:at(-250)}),machine('undated',{...outside,at:null})],new Set(['old','undated']),now);
  expect(result.map(r=>r.status)).toEqual(['yard','out']);expect(result.every(r=>r.lastKnownOnly)).toBe(true);
  expect(result[0].reportedAt).toBe(at(-250));expect(result[1].reportedAt).toBeNull();
 });
 it('recovers the last usable position from history and prefers newer undated observations to old alternate feeds',()=>{
  const result=plantPositions([{...machine('a',null),positionHistory:[{...inside,at:at(-60)}]},machine('b',{...inside,at:at(-100)}),{...machine('b',{...outside,at:null}),source:'assetcare',observedAt:at(-1)}],new Set(['a','b']),now);
  expect(result.map(r=>r.status)).toEqual(['yard','out']);
 });
 it('uses UK day, Monday week and month boundaries across daylight saving',()=>{
  const dates=plantPeriodStarts(Date.parse('2026-09-27T23:30:00Z'));
  expect(new Date(dates.today).toISOString()).toBe('2026-09-27T23:00:00.000Z');expect(dates.week).toBe(dates.today);
  expect(new Date(plantPeriodStarts(Date.parse('2026-10-25T12:00:00Z')).today).toISOString()).toBe('2026-10-24T23:00:00.000Z');
 });
 it('keeps figures and movement cards within the eligible plant cohort and preserves pre-week turnaround',()=>{
  const m=[machine('a'),machine('staff',inside,'People')];
  const result=plantBoardData(m,new Set(['a','staff']),[event('1','a','yard_arrival',at(-72)),event('2','a','yard_departure',at(-1)),event('3','staff','yard_departure',at(-1))],now);
  expect(result.tracked).toBe(1);expect(result.out+result.yard+result.unknown).toBe(result.tracked);
  expect(result.today.departures).toBe(1);expect(result.week.returns).toBe(0);expect(result.week.turnaroundHours).toBe(71);expect(result.month.returns).toBe(1);
  expect(result.recent.every(r=>r.label==='a')).toBe(true);expect(JSON.stringify(result)).not.toContain('latitude');expect(JSON.stringify(result)).not.toContain('staff');
 });
 it('shows only today’s movements newest first from UK midnight, retaining weekly and monthly totals',()=>{
  const events=[event('yesterday','a','yard_arrival','2026-09-27T22:59:59Z'),event('midnight','a','yard_departure','2026-09-27T23:00:00Z'),event('later','a','yard_arrival','2026-09-28T09:00:00Z'),event('latest','a','yard_departure','2026-09-28T11:00:00Z')];
  const report=plantBoardData([machine('a')],new Set(['a']),events.reverse(),now);
  expect(report.recent.map(e=>e.id)).toEqual(['latest','later','midnight']);
  expect(report.month.returns).toBe(2);expect(report.today.returns).toBe(1);
  const tomorrow=plantBoardData([machine('a')],new Set(['a']),events,Date.parse('2026-09-28T23:00:00Z'));
  expect(tomorrow.recent).toEqual([]);expect(tomorrow.today.departures).toBe(0);
 });
 it('represents absent history as unknown rather than a zero turnaround',()=>{
  const result=plantBoardData([],new Set(),[],now);expect(result.historySince).toBeNull();expect(result.month.turnaroundHours).toBeNull();expect(result.month.redeploymentPercent).toBeNull();
 });
 it('rotates all three screens on the clock without a data-refresh input',()=>{
  expect([0,25000,50000,75000,85000,100000].map(t=>boardSlide(now,now+t))).toEqual([0,1,2,0,0,1]);
 });
});

describe('recent location confidence',()=>{
 it('separates stale and undated last-known positions from recent totals',()=>{
  const rows=[machine('fresh',{...inside,at:at(-.25)}),machine('edge-age',{...outside,at:at(-.5)}),machine('stale',{...inside,at:at(-.5-1/3600)}),machine('undated',{...outside,at:null}),machine('missing',null)];
  const data=plantBoardData(rows,new Set(rows.map(m=>m.pin)),[],now);
  expect([data.yard,data.out,data.unknown]).toEqual([1,1,3]);
  expect(data.lastKnown).toEqual({yard:1,out:1,unclear:1});
  expect(data.locationReasons).toEqual({stale:1,undated:1,boundary:0,conflict:0,missing:1});
  expect(data.yard+data.out+data.unknown).toBe(data.tracked);
 });
 it('retains boundary-held yard evidence without treating it as a recent clear fix',()=>{
  const row={...machine('edge',{latitude:52.3920966667,longitude:.95433,at:at(-.1)}),confirmedYardSide:'off_hire' as const,confirmedYardAt:at(-2)};
  const data=plantBoardData([row],new Set(['edge']),[],now);
  expect([data.yard,data.out,data.unknown]).toEqual([0,0,1]);expect(data.lastKnown.yard).toBe(1);expect(data.locationReasons.boundary).toBe(1);
 });
 it('does not claim a recent location when recent providers disagree',()=>{
  const rows=[machine('mixed',{...inside,at:at(-.1)}),{...machine('mixed',{...outside,at:at(-.2)}),source:'assetcare' as const}];
  const data=plantBoardData(rows,new Set(['mixed']),[],now);
  expect(data.tracked).toBe(1);expect(data.unknown).toBe(1);expect(data.locationReasons.conflict).toBe(1);expect(data.lastKnown.unclear).toBe(1);
 });
 it('ages a position into needs confirmation without losing movement history',()=>{
  const rows=[machine('a',{...inside,at:at(-.25)})],events=[event('left','a','yard_departure',at(-2))];
  const fresh=plantBoardData(rows,new Set(['a']),events,now),later=plantBoardData(rows,new Set(['a']),events,now+16*60000);
  expect(fresh.yard).toBe(1);expect(later.yard).toBe(0);expect(later.lastKnown.yard).toBe(1);expect(later.today.departures).toBe(fresh.today.departures);
 });
});
