import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {savedRoamHours,syncRoamHours} from '@/lib/integrations/roam/hours-server';
import {hoursCsv} from '@/lib/integrations/roam/hours';
export const maxDuration=300;
export async function GET(request:NextRequest){try{await authorizeOperations(request);const data=await savedRoamHours(request.nextUrl.searchParams.get('machineId')||undefined);if(request.nextUrl.searchParams.get('format')==='csv')return new Response(hoursCsv(data.items),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=AssetCare+-asset-hours.csv','Cache-Control':'private, no-store'}});return jcbJson(data)}catch(e){return jcbError(e)}}
export async function POST(request:NextRequest){try{await authorizeOperations(request);return jcbJson(await syncRoamHours())}catch(e){return jcbError(e)}}
