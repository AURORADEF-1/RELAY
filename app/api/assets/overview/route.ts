import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {loadYardEvents,londonDate} from '@/lib/yard-report';
import {ukMidnight} from '@/lib/plant-wallboard/model';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {activeTicketStatuses} from '@/lib/statuses';
import {openRequestsByFleet,type FleetRequestTicket} from '@/lib/fleet-operations/parts-requests';
import {jcbError,jcbJson} from '@/lib/integrations/jcb/server';

export const maxDuration=60;
export async function GET(request:NextRequest){try{
 const auth=await authorizeAssets(request,true),now=Date.now(),db=operationsDatabase();
 const [{registry,allowed},events,flags]=await Promise.all([
  ownership(db),loadYardEvents(auth.supabase,now,request.signal),db.from('fleet_asset_flags').select('id,asset_key,label,reason,created_at,machine_id').is('resolved_at',null).order('created_at',{ascending:false}).limit(2000)
 ]);
 if(flags.error)throw new Error('Flag summary unavailable.');
 const tickets:FleetRequestTicket[]=[];let requestsAvailable=true;
 for(let offset=0;offset<20000;offset+=500){const result=await auth.supabase.from('tickets').select('id,job_number,status,machine_number_normalized,machine_number,machine_reference,is_retail_sale').in('status',[...activeTicketStatuses]).order('id').range(offset,offset+499);if(result.error){requestsAvailable=false;break;}tickets.push(...result.data as FleetRequestTicket[]);if(result.data.length<500)break;}
 const owned=registry.filter(machine=>allowed.has(machine.id)),requests=openRequestsByFleet(tickets,owned);
 const todayStart=ukMidnight(londonDate(now)),today=events.filter(event=>Date.parse(event.occurred_at)>=todayStart);
 const recent=[...events].sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,12);
 const latestByMachine=new Map<string,(typeof events)[number]>();for(const event of events){const current=latestByMachine.get(event.machine_id);if(!current||Date.parse(event.occurred_at)>Date.parse(current.occurred_at))latestByMachine.set(event.machine_id,event);}
 const longest=[...latestByMachine.values()].filter(event=>event.kind==='yard_arrival').sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)).slice(0,12);
 const shape=(event:(typeof events)[number])=>({id:event.id,machineId:event.machine_id,label:event.machine?.machine_number??event.machine_id,model:[event.machine?.make,event.machine?.model].filter(Boolean).join(' '),kind:event.kind,at:event.occurred_at,provider:event.provider});
 return jcbJson({yard:{returnedToday:today.filter(event=>event.kind==='yard_arrival').map(shape),leftToday:today.filter(event=>event.kind==='yard_departure').map(shape),recent:recent.map(shape),longest:longest.map(shape)},attention:{flags:flags.data??[],openPartsRequests:requestsAvailable?[...requests.values()].reduce((sum,list)=>sum+list.length,0):null,assetsWithOpenPartsRequests:requestsAvailable?[...requests.values()].filter(list=>list.length).length:null}});
 }catch(error){return jcbError(error);}}
