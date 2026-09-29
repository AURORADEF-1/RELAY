import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {groupedFleet} from '@/lib/fleet-map/group-store';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError} from '@/lib/integrations/jcb/server';
import {historyRange,historyReport,historyCsv} from '@/lib/staff/history';
import {historyPdf} from '@/lib/staff/history-pdf';
export const maxDuration=60;
export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const q=request.nextUrl.searchParams,id=q.get('id'),format=q.get('format');
 if(!id||!['pdf','csv'].includes(format??''))throw new JcbError('Choose a driver and PDF or CSV.',400);
 const now=Date.now();let range;try{range=historyRange(q.get('from')??'',q.get('to')??'',now);}catch(e){throw new JcbError((e as Error).message,400);}
 const fleet=await getAssetCareFleet(),machines=await groupedFleet(fleet.machines);
 const machine=machines.find(m=>m.pin===id&&m.assetCategory==='People');
 if(!machine)throw new JcbError('Staff vehicle not found.',404);
 const owner=process.env.ASSETCARE_OWNER_ID;if(!owner)throw new JcbError('Tracking history unavailable.',503);
 const result=await operationsDatabase().rpc('staff_history_events',{p_id:id,p_owner:owner,p_start:new Date(range.start).toISOString(),p_end:new Date(range.end).toISOString()});
 if(result.error||!result.data||!Array.isArray(result.data.events))throw new JcbError('History unavailable. Please retry.',503);
 if(result.data.events.length>10000)throw new JcbError('Too many events. Choose a shorter date range.',422);
 const report=historyReport({id,label:machine.equipmentId,department:machine.assetGroup??'Ungrouped'},range,result.data.events,result.data.archive_start,result.data.latest_saved,now,fleet.stale);
 const body=format==='pdf'?Buffer.from(await historyPdf(report)):historyCsv(report);
 const name=machine.equipmentId.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70)||'driver';
 return new Response(body,{headers:{'Content-Type':format==='pdf'?'application/pdf':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}_${range.from}_${range.to}.${format}"`,'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
 }catch(e){return jcbError(e);}}
