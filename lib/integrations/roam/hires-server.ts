import 'server-only';
import {z} from 'zod';
import {JcbError} from '@/lib/integrations/jcb/client';
import {hirePageSchema,hireDetailSchema,photoLinkSchema} from './hires';
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
