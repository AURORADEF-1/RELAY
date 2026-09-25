import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {combinedFleet} from '@/lib/fleet-map/server';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {bookingSchema,periodSchema,ukToday,type Booking} from '@/lib/fleet-scheduler/model';
export const maxDuration=60;
export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const p=periodSchema.safeParse({start:request.nextUrl.searchParams.get('start')??ukToday(),end:request.nextUrl.searchParams.get('end')??ukToday()});
 if(!p.success)throw new JcbError('Choose a valid date range of up to one year.',400);
 const db=operationsDatabase(),[fleet,owners,result]=await Promise.all([combinedFleet(request),ownership(db),db.from('fleet_reservations').select('*').eq('status','reserved').lte('starts_on',p.data.end).gte('ends_on',p.data.start).order('starts_on').limit(5001)]);
 if(result.error||(result.data?.length??0)>5000)throw new JcbError('Reservations unavailable. Choose a shorter date range.',503);
 return jcbJson({...fleet,machines:fleet.machines.filter(m=>!m.relay||owners.allowed.has(m.relay.id)),bookingMachines:owners.registry.filter(m=>result.data.some(b=>b.machine_id===m.id)),bookings:result.data,period:p.data,checkedAt:new Date().toISOString()});
 }catch(e){return jcbError(e);}}
export async function POST(request:NextRequest){try{
 const auth=await authorizeAssets(request,true),raw=await request.json().catch(()=>null),db=operationsDatabase();
 if(raw?.action==='cancel'){
  const id=String(raw.id??'');if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))throw new JcbError('Invalid reservation.',400);
  const r=await db.from('fleet_reservations').update({status:'cancelled',cancelled_by:auth.user.id,cancelled_at:new Date().toISOString()}).eq('id',id).eq('status','reserved').select('id');
  if(r.error)throw new JcbError('Unable to cancel reservation.',503);if(!r.data?.length)throw new JcbError('Reservation is already cancelled or unavailable. Refresh the diary.',409);return jcbJson({ok:true});
 }
 const parsed=bookingSchema.safeParse(raw);if(!parsed.success)throw new JcbError('Enter a machine, job/site and valid dates of up to one year.',400);
 const p=parsed.data;if(p.start<ukToday())throw new JcbError('Reservations must start today or later.',400);
 const owners=await ownership(db);if(!owners.allowed.has(p.machineId))throw new JcbError('Choose an active MLP fleet machine.',400);
 const payload={id:p.id,machine_id:p.machineId,starts_on:p.start,ends_on:p.end,job_reference:p.job,site:p.site,notes:p.notes,status:'reserved',created_by:auth.user.id};
 const existing=await db.from('fleet_reservations').select('*').eq('id',p.id).maybeSingle();if(existing.error)throw new JcbError('Unable to check reservation.',503);
 if(existing.data){const same=Object.entries(payload).every(([k,v])=>existing.data[k]===v);if(!same)throw new JcbError('This submission was already used. Start a new reservation.',409);return jcbJson({booking:existing.data});}
 const r=await db.from('fleet_reservations').insert(payload).select('*').single<Booking>();
 if(r.error)throw new JcbError(r.error.code==='23P01'?'This machine is already reserved for overlapping dates. Refresh the diary.':'Unable to confirm reservation. Retry the same submission.',r.error.code==='23P01'?409:503);
 return jcbJson({booking:r.data},201);
 }catch(e){return jcbError(e);}}
