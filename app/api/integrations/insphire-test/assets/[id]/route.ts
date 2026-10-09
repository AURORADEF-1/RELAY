import {NextRequest,NextResponse} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError} from '@/lib/integrations/jcb/server';
import {jobsSchema,requestInspHireTest} from '@/lib/integrations/insphire-test/client';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
type Mapping={machine_id:string;source_reference:string;reviewed_by:string;reviewed_at:string};

async function machineAndMapping(id:string){
 const db=operationsDatabase(),owned=await ownership(db),machine=owned.registry.find(row=>row.id===id);
 if(!machine||!owned.allowed.has(id))throw new JcbError('MLP asset not found.',404);
 const result=await db.from('insphire_asset_mappings').select('machine_id,source_reference,reviewed_by,reviewed_at').eq('machine_id',id).maybeSingle();
 if(result.error)throw new JcbError('InspHire mapping storage is unavailable.',503);
 return {db,machine,mapping:result.data as Mapping|null};
}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const auth=await authorizeAssets(request,false,['workshop']),{id}=await params,{machine,mapping}=await machineAndMapping(id);
 if(!mapping)return NextResponse.json({enabled:process.env.INSPHIRE_TEST_ENABLED==='true',admin:auth.admin,machine:{id:machine.id,fleetNumber:machine.machine_number},mapping:null,jobs:[],hasMore:false},{headers});
 if(process.env.INSPHIRE_TEST_ENABLED!=='true')return NextResponse.json({enabled:false,admin:auth.admin,machine:{id:machine.id,fleetNumber:machine.machine_number},mapping:{sourceReference:mapping.source_reference,reviewedAt:mapping.reviewed_at},jobs:[],hasMore:false},{headers});
 const query=new URLSearchParams({fleetNumber:mapping.source_reference,limit:'25'}),result=await requestInspHireTest('workshop-jobs',jobsSchema,query);
 return NextResponse.json({enabled:true,admin:auth.admin,machine:{id:machine.id,fleetNumber:machine.machine_number},mapping:{sourceReference:mapping.source_reference,reviewedAt:mapping.reviewed_at},jobs:result.data.jobs,hasMore:result.data.hasMore,checkedAt:result.checkedAt,dataFreshness:result.dataFreshness,database:result.database},{headers});
 }catch(error){return jcbError(error);}}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const auth=await authorizeAssets(request,true),{id}=await params,{db}=await machineAndMapping(id),body=await request.json() as {sourceReference?:unknown};
 const sourceReference=typeof body.sourceReference==='string'?body.sourceReference.trim():'';
 if(sourceReference&&!/^[A-Za-z0-9 _./-]{1,32}$/.test(sourceReference))throw new JcbError('Enter a valid InspHire asset reference.',400);
 if(!sourceReference){const removed=await db.from('insphire_asset_mappings').delete().eq('machine_id',id);if(removed.error)throw new JcbError('Unable to remove the InspHire mapping.',503);return NextResponse.json({ok:true,mapping:null},{headers});}
 const saved=await db.from('insphire_asset_mappings').upsert({machine_id:id,source_reference:sourceReference,reviewed_by:auth.user.id,reviewed_at:new Date().toISOString()},{onConflict:'machine_id'}).select('source_reference,reviewed_at').single();
 if(saved.error)throw new JcbError(saved.error.code==='23505'?'That InspHire reference is already mapped to another machine.':'Unable to save the InspHire mapping.',saved.error.code==='23505'?409:503);
 return NextResponse.json({ok:true,mapping:{sourceReference:saved.data.source_reference,reviewedAt:saved.data.reviewed_at}},{headers});
 }catch(error){return jcbError(error);}}
