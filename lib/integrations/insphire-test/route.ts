import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {healthSchema,jobsSchema,querySchema,requestInspHireTest} from './client';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function handleInspHireTest(request:NextRequest,kind:'health'|'workshop-jobs'){
 if(process.env.INSPHIRE_TEST_ENABLED!=='true')return NextResponse.json({ok:false,error:'InspHire test connector is disabled.'},{status:503,headers});
 const auth=await authorizeRelayRequesterRoute(request);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status,headers});
 const profile=await auth.supabase.from('profiles').select('role').eq('id',auth.user.id).maybeSingle<{role:string|null}>();
 if(profile.error)return NextResponse.json({ok:false,error:'Unable to verify access.'},{status:503,headers});
 if(profile.data?.role?.trim().toLowerCase()!=='admin')return NextResponse.json({ok:false,error:'Admin access is required.'},{status:403,headers});
 const params=request.nextUrl.searchParams,duplicate=[...params.keys()].some(key=>params.getAll(key).length>1);
 if(duplicate||(kind==='health'&&params.size>0)||!querySchema.safeParse(Object.fromEntries(params)).success)return NextResponse.json({ok:false,error:'Invalid query parameters.'},{status:400,headers});
 try{const data=kind==='health'?await requestInspHireTest(kind,healthSchema):await requestInspHireTest(kind,jobsSchema,params);return NextResponse.json(data,{headers});}catch{return NextResponse.json({ok:false,error:'InspHire test connector is unavailable or not configured.'},{status:503,headers});}
}
