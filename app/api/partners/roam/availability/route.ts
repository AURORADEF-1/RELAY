import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {authorizeRicoFleetFeed} from '@/lib/integrations/rico/feed-auth';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {recordedAssessments} from '@/lib/fleet-workflow/server';
import {roamAvailability} from '@/lib/fleet-workflow/model';
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
export async function GET(request:NextRequest){
 if(!authorizeRicoFleetFeed(request.headers.get('authorization'),process.env.ROAM_TRACKING_FEED_TOKEN||'',process.env.ROAM_TRACKING_FEED_TOKEN_PREVIOUS||''))return json({error:'Authentication required.'},401);
 if(process.env.FLEET_WORKFLOW_ENABLED!=='true')return json({error:'Fleet workflow is not enabled.'},503);
 try{const rows=await recordedAssessments(operationsDatabase());return json({schema_version:1,generated_at:new Date().toISOString(),complete:true,unlisted_status:'not_assessed',assets:rows.filter(r=>r.status!=='excluded').map(roamAvailability)});}catch{return json({error:'Hire clearance unavailable. Do not assume availability.'},503)}
}
