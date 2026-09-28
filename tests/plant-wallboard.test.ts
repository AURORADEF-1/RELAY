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
 it('keeps stale, missing, invalid and conflicting GPS in the unclear count',()=>{
  const m=[machine('old',{...inside,at:at(-25)}),machine('missing',null),machine('future',{...inside,at:at(1)}),machine('zero',{latitude:0,longitude:0,at:at(-1)}),machine('conflict',inside),machine('conflict',outside)];
  expect(plantPositions(m,new Set(m.map(r=>r.pin)),now).every(r=>r.status==='unknown')).toBe(true);
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
 it('represents absent history as unknown rather than a zero turnaround',()=>{
  const result=plantBoardData([],new Set(),[],now);expect(result.historySince).toBeNull();expect(result.month.turnaroundHours).toBeNull();expect(result.month.redeploymentPercent).toBeNull();
 });
 it('rotates all three screens on the clock without a data-refresh input',()=>{
  expect([0,25000,50000,75000,85000,100000].map(t=>boardSlide(now,now+t))).toEqual([0,1,2,0,0,1]);
 });
});
