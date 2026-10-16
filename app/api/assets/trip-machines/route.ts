import type {NextRequest} from 'next/server';
import {tripMachinesForViewer} from '@/lib/trip-history/machines';
import {jcbError} from '@/lib/integrations/jcb/server';

export async function GET(request:NextRequest){try{
 const query=(request.nextUrl.searchParams.get('q')??'').trim().toLowerCase().slice(0,100);
 const all=request.nextUrl.searchParams.get('all')==='1';
 if(!all&&query.length<2)return Response.json({machines:[]},{headers:{'Cache-Control':'private, max-age=60','Vary':'Authorization, x-relay-preview-access-group'}});
 const visible=await tripMachinesForViewer(request),terms=query.split(/\s+/).filter(Boolean),machines=(all&&!terms.length?visible:visible.filter(machine=>terms.every(term=>`${machine.name} ${machine.id} ${machine.group}`.toLowerCase().includes(term)))).slice(0,all?5000:20);
 return Response.json({machines},{headers:{'Cache-Control':'private, max-age=60','Vary':'Authorization, x-relay-preview-access-group'}});
 }catch(error){return jcbError(error);}}
