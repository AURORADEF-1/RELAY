import {activeTicketStatuses} from '@/lib/statuses';
import type {OpenPartsRequest} from './report';
export type FleetRequestTicket={id:string;job_number:string|null;status:string;machine_number_normalized:string|null;machine_number:string|null;machine_reference:string|null;is_retail_sale:boolean|null};
export const fleetReference=(s:string|null|undefined)=>(s??'').trim().replace(/\s+/g,'').toUpperCase();
export function openRequestsByFleet(tickets:FleetRequestTicket[],machines:{id:string;machine_number:string}[]){
 const counts=new Map<string,number>();for(const m of machines){const key=fleetReference(m.machine_number);counts.set(key,(counts.get(key)||0)+1);}
 const result=new Map<string,OpenPartsRequest[]>(),seen=new Set<string>();
 for(const t of tickets){
  if(seen.has(t.id)||t.is_retail_sale||!(activeTicketStatuses as readonly string[]).includes(t.status))continue;
  const key=fleetReference(t.machine_number_normalized||t.machine_number||t.machine_reference);
  if(!key||counts.get(key)!==1)continue;
  seen.add(t.id);result.set(key,[...(result.get(key)||[]),{id:t.id,jobNumber:t.job_number,status:t.status}]);
 }
 return result;
}
