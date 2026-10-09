import 'server-only';
import {z} from 'zod';

const envelope=z.object({ok:z.literal(true),database:z.literal('iHTEST_MLP'),environment:z.literal('test'),readOnly:z.literal(true),checkedAt:z.string().datetime({offset:true}),dataFreshness:z.string().max(200)});
export const healthSchema=envelope.extend({data:z.object({connected:z.literal(true),permissionsVerified:z.literal(true)})});
export const jobsSchema=envelope.extend({data:z.object({jobs:z.array(z.object({jobNumber:z.string().max(32),fleetNumber:z.string().max(32).nullable(),status:z.number().int(),jobDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()})).max(50),hasMore:z.boolean(),nextCursor:z.string().max(32).nullable()})});
export const querySchema=z.object({jobNumber:z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),fleetNumber:z.string().regex(/^[A-Za-z0-9 _./-]{1,32}$/).optional(),after:z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),limit:z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).optional(),status:z.string().regex(/^(?:[0-9]|[1-9][0-9])$/).optional()}).strict();

export async function requestInspHireTest<T>(path:'health'|'workshop-jobs',schema:z.ZodType<T>,query=new URLSearchParams()):Promise<T>{
 const base=process.env.INSPHIRE_TEST_API_URL,token=process.env.INSPHIRE_TEST_API_TOKEN;
 if(!base||!token||!/^[a-f0-9]{64}$/.test(token))throw new Error('Test connector is not configured.');
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw new Error('Test connector requires a secure gateway origin.');
 url.pathname=`/v1/${path}`;url.search=query.toString();
 const response=await fetch(url,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error('Test connector is unavailable.');
 const parsed=schema.safeParse(await response.json());if(!parsed.success)throw new Error('Test connector returned an unexpected database or response.');return parsed.data;
}
