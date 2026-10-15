import type {NextRequest} from 'next/server';
import {tripMachinesForViewer} from '@/lib/trip-history/machines';
import {jcbError} from '@/lib/integrations/jcb/server';

export async function GET(request:NextRequest){try{
 const query=(request.nextUrl.searchParams.get('q')??'').trim().toLowerCase().slice(0,100);
 if(query.length<2)return Response.json({machines:[]},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization, x-relay-preview-access-group'}});
 const terms=query.split(/\s+/),machines=(await tripMachinesForViewer(request)).filter(machine=>terms.every(term=>`${machine.name} ${machine.id} ${machine.group}`.toLowerCase().includes(term))).slice(0,20);
 return Response.json({machines},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization, x-relay-preview-access-group'}});
 }catch(error){return jcbError(error);}}
