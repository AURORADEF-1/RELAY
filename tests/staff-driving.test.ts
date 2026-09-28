import {expect,it} from 'vitest';
import {staffDaily,type StaffEvent} from '@/lib/staff/daily';
import {drivingLeague} from '@/lib/staff/driving';
import {staffRow} from '@/lib/staff/model';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-28T16:00:00Z');
const row=(id:string,count:number,department='Transport',available=true)=>({...staffRow({pin:id,equipmentId:id,assetGroup:department} as LinkedJcbMachine,[],now),daily:{...staffDaily([],now,available),speedingCount:count}});
it('ranks ties equally, filters department and search, and never ranks unavailable or zero alerts',()=>{
 const rows=[row('A',3),row('B',3),row('C',1),row('D',0),row('E',9,'Workshop'),row('F',99,'Transport',false)];
 expect(drivingLeague(rows,'Transport').map(r=>[r.id,r.rank])).toEqual([['A',1],['B',1],['C',3],['D',null],['F',null]]);
 expect(drivingLeague(rows,'Workshop','e',true).map(r=>r.id)).toEqual(['E']);
 expect(drivingLeague(rows,'Transport','',true)).toHaveLength(3);
});
it('uses all alerts for maxima even when evidence is capped and does not invent missing limits',()=>{
 const events:StaffEvent[]=Array.from({length:25},(_,i)=>({asset_id:'a',event_id:`${i}`,kind:'speeding',occurred_at:new Date(now-(25-i)*60000).toISOString(),speed_kph:i===0?'120':'90',limit_kph:i===0?'80':null}));
 const daily=staffDaily(events,now);expect(daily.speedingCount).toBe(25);expect(daily.drivingAlerts).toHaveLength(20);expect(daily.peakSpeedKph).toBe(120);expect(daily.maxExcessKph).toBe(40);
 expect(staffDaily(events.slice(1),now).maxExcessKph).toBeNull();
});
