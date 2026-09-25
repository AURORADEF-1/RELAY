import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
const kinds=['movement','yard_arrival','yard_departure','fault','not_checked_in','data_unavailable'];
export async function GET(request:NextRequest){try{
 const auth=await authorizeAssets(request,true),kind=request.nextUrl.searchParams.get('kind'),offset=Number(request.nextUrl.searchParams.get('offset')??0),before=request.nextUrl.searchParams.get('before')??new Date().toISOString();
 if(kind&&!kinds.includes(kind)||!Number.isInteger(offset)||offset<0||offset>10000||!Number.isFinite(Date.parse(before)))throw new JcbError('Invalid inbox filter.',400);
 if(request.nextUrl.searchParams.get('summary')==='true'){const count=await auth.supabase.rpc('asset_inbox_unread_count');if(count.error)throw new JcbError('Inbox count unavailable.',503);return jcbJson({unread:Number(count.data)});}
 const r=await auth.supabase.rpc('asset_inbox_page',{p_kind:kind||null,p_unread:request.nextUrl.searchParams.get('unread')==='true',p_before:before,p_offset:offset});
 if(r.error)throw new JcbError('Asset Inbox is not ready. Please retry after setup completes.',503);
 const rows=r.data.slice(0,50),ids=[...new Set(rows.map((r:{machine_id:string})=>r.machine_id))];
 const machines=ids.length?await auth.supabase.from('machines').select('id,machine_number,make,model').in('id',ids):{data:[],error:null};
 if(machines.error)throw new JcbError('Machine identities unavailable.',503);
 return jcbJson({rows:rows.map((r:{machine_id:string})=>({...r,machine:machines.data?.find(m=>m.id===r.machine_id)})),next:r.data.length>50?offset+50:null,before,enabled:process.env.ASSET_INBOX_ENABLED==='true'});
 }catch(e){return jcbError(e);}}
export async function POST(request:NextRequest){try{
 const auth=await authorizeAssets(request,true),body=await request.json().catch(()=>null);
 if(!body||typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)||!['read','acknowledge'].includes(body.action))throw new JcbError('Invalid inbox action.',400);
 const event=await auth.supabase.from('asset_events').select('id').eq('id',body.id).maybeSingle();if(event.error)throw new JcbError('Inbox unavailable.',503);if(!event.data)throw new JcbError('Event not found.',404);
 const now=new Date().toISOString(),r=await auth.supabase.from('asset_event_receipts').upsert({event_id:body.id,user_id:auth.user.id,read_at:now,...(body.action==='acknowledge'?{acknowledged_at:now}:{})},{onConflict:'event_id,user_id',ignoreDuplicates:body.action==='read'});
 if(r.error)throw new JcbError('Unable to update inbox.',503);return jcbJson({ok:true});
 }catch(e){return jcbError(e);}}
