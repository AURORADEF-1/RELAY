import {expect,it} from 'vitest';
import {staffDaily,type StaffEvent} from '@/lib/staff/daily';
const now=Date.parse('2026-09-28T16:00:00Z');
const event=(kind:StaffEvent['kind'],at:string,id=at):StaffEvent=>({asset_id:'a',event_id:id,kind,occurred_at:at});
it('retains the first arrival and latest departure after repeat trips',()=>{
 const d=staffDaily([event('arrival','2026-09-28T06:00:00Z'),event('departure','2026-09-28T08:00:00Z'),event('arrival','2026-09-28T10:00:00Z'),event('departure','2026-09-28T15:00:00Z')],now);
 expect(d.firstArrival).toBe('2026-09-28T06:00:00Z');expect(d.lastDeparture).toBe('2026-09-28T15:00:00Z');expect(d.state).toBe('not_returned');expect(d.movements).toHaveLength(4);
});
it('recognizes a later return and never invents an arrival before a departure',()=>{
 expect(staffDaily([event('departure','2026-09-28T06:00:00Z')],now).firstArrival).toBeNull();
 expect(staffDaily([event('departure','2026-09-28T06:00:00Z'),event('arrival','2026-09-28T07:00:00Z')],now).state).toBe('in_yard');
});
it('uses UK calendar days, excludes future data, deduplicates replays and sorts',()=>{
 const e=event('arrival','2026-09-27T23:10:00Z');const d=staffDaily([event('departure','2026-09-28T18:00:00Z'),e,e,event('departure','2026-09-27T22:59:00Z')],now);expect(d.movements).toHaveLength(1);expect(d.firstArrival).toBe(e.occurred_at);
});
it('separates unavailable, no events, conflicts and explicit speeding evidence',()=>{
 expect(staffDaily([],now,false).state).toBe('unavailable');expect(staffDaily([],now).state).toBe('no_events');
 expect(staffDaily([event('arrival','2026-09-28T06:00:00Z','a'),event('departure','2026-09-28T06:00:00Z','b')],now).state).toBe('uncertain');
 const e={...event('speeding','2026-09-28T06:00:00Z'),speed_kph:'102',limit_kph:'96'};const d=staffDaily([e,e],now);expect(d.speedingCount).toBe(1);expect(d.drivingAlerts[0]).toMatchObject({speedKph:102,limitKph:96});expect(d.movements).toHaveLength(0);
});
