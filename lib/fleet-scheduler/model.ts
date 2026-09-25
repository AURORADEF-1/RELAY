import {z} from 'zod';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {positionSide} from '@/lib/fleet-operations/report';
import {currentTransit} from '@/lib/assets/transit';
export const ukToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
export const periodSchema=z.object({start:day,end:day}).refine(p=>p.end>=p.start&&Date.parse(p.end)-Date.parse(p.start)<=366*86400000);
export const bookingSchema=z.object({id:z.string().uuid(),machineId:z.string().uuid(),start:day,end:day,job:z.string().trim().min(1).max(100),site:z.string().trim().min(1).max(200),notes:z.string().trim().max(1000).default('')}).refine(p=>p.end>=p.start&&Date.parse(p.end)-Date.parse(p.start)<=366*86400000);
export type Booking={id:string;machine_id:string;starts_on:string;ends_on:string;job_reference:string;site:string;notes:string|null;status:'reserved'|'cancelled';created_by:string;created_at:string};
export function availability(m:LinkedJcbMachine,bookings:Booking[],start:string,end:string,now=Date.now()){
 const reserved=bookings.filter(b=>b.machine_id===m.relay?.id&&b.status==='reserved'&&b.starts_on<=end&&b.ends_on>=start);
 const transit=currentTransit(m,now),side=positionSide(m.position,now);
 const state=transit?'transit':!m.relay?'unlinked':side==='unknown'?'unknown':reserved.length?'reserved':side==='off_hire'?'available':'away';
 const labels={transit:'In transit',unlinked:'Needs fleet linking',unknown:'Location needs attention',reserved:'Reserved',available:'In yard · available',away:'On hire / away from yard'};
 return {state,label:labels[state],reserved,at:m.position?.at??null,inYard:side==='off_hire',transit};
}
