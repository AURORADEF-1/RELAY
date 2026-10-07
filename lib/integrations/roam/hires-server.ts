import 'server-only';
import {z} from 'zod';
import {JcbError} from '@/lib/integrations/jcb/client';
import {hirePageSchema,hireDetailSchema,photoLinkSchema,hireSchema} from './hires';
const BASE='https://roam-henna.vercel.app/api/partners/relay/hires';
async function read<T>(suffix:string,schema:z.ZodType<T>):Promise<T>{
 const token=process.env.ROAM_RELAY_HIRES_TOKEN;if(!token)throw new JcbError('ROAM hire connection is not configured.',503);
 let response:Response;try{response=await fetch(BASE+suffix,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});}catch{throw new JcbError('ROAM is unavailable. Please retry.',503)}
 if(response.status===404)throw new JcbError('This hire or photo is no longer available in current ROAM hires.',404);
 if(!response.ok)throw new JcbError('ROAM hire connection is unavailable. Please retry.',503);
 try{return schema.parse(await response.json())}catch{throw new JcbError('ROAM returned an incomplete hire response. Please retry.',503)}
}
export function readRoamHires(cursor?:string){if(cursor&&(!/^[\w-]+$/.test(cursor)||cursor.length>1000))throw new JcbError('Invalid hire page.',400);return read('?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),hirePageSchema)}
export function readRoamHire(id:string){return read('/'+encodeURIComponent(id),hireDetailSchema)}
export function readRoamPhoto(id:string,photoId:string){return read('/'+encodeURIComponent(id)+'/photos/'+encodeURIComponent(photoId),photoLinkSchema)}

export async function readAllRoamHires(){
 const items:z.infer<typeof hireSchema>[]=[];let cursor:string|undefined,generatedAt:string|null=null;const seen=new Set<string>();
 do{
  const page=await readRoamHires(cursor);
  generatedAt??=page.generated_at;items.push(...page.items);
  if(items.length>5000)throw new JcbError('ROAM current hires exceed the safe refresh limit.',503);
  if(page.next_cursor){if(seen.has(page.next_cursor))throw new JcbError('ROAM returned an invalid hire page.',503);seen.add(page.next_cursor);}
  cursor=page.next_cursor??undefined;
 }while(cursor);
 return {items,generatedAt};
}

export async function readRoamLifecycle(){
 const schema=z.object({schema_version:z.literal(1),scope:z.literal('lifecycle'),revision:z.string(),items:z.array(hireSchema),next_offset:z.number().int().nonnegative().nullable()});
 const token=process.env.ROAM_RELAY_HIRES_TOKEN;if(!token)throw new JcbError('ROAM connection is not configured.',503);
 const rows:z.infer<typeof hireSchema>[]=[];let offset:number|null=0,revision:string|undefined;
 do{const r=await fetch('https://roam-henna.vercel.app/api/partners/relay/hire-lifecycle?offset='+offset,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new JcbError('ROAM collection status is unavailable.',503);const page=schema.parse(await r.json());if(revision&&revision!==page.revision)throw new JcbError('ROAM hires changed. Refresh to retry.',503);revision=page.revision;rows.push(...page.items);if(rows.length>50000||page.next_offset!==null&&page.next_offset<=offset)throw new JcbError('Invalid lifecycle page.',503);offset=page.next_offset;}while(offset!==null);
 return rows;
}
