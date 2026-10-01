import {z} from 'zod';
export const photoSchema:z.ZodType<RoamPhoto>=z.lazy(()=>z.object({id:z.string(),name:z.string().nullable(),annotated:z.boolean(),url_endpoint:z.string(),original:photoSchema.nullable()}).passthrough());
export type RoamPhoto={id:string;name:string|null;annotated:boolean;url_endpoint:string;original:RoamPhoto|null};
const details=z.record(z.string(),z.unknown());
export const hireSchema=z.object({id:z.string(),hire_reference:z.string(),revision:z.string(),status:z.enum(['scheduled','on_site','collected']),machine:details,customer:details,driver:details,site:details,schedule:details,delivery:details,collection:details,notes:z.string(),events:z.array(z.object({photos:z.array(photoSchema)}).passthrough()),damage_reports:z.array(z.object({photos:z.array(photoSchema)}).passthrough()),history:z.array(details)}).passthrough();
export type RoamHire=z.infer<typeof hireSchema>;
export const hirePageSchema=z.object({schema_version:z.literal(1),scope:z.literal('current'),generated_at:z.string(),total:z.number().int().nonnegative(),items:z.array(hireSchema.refine(h=>h.status!=='collected')),next_cursor:z.string().nullable()});
export const hireDetailSchema=z.object({schema_version:z.literal(1),scope:z.literal('current'),item:hireSchema.refine(h=>h.status!=='collected')});
export const photoLinkSchema=z.object({schema_version:z.literal(1),photo_id:z.string(),url:z.url().refine(v=>new URL(v).protocol==='https:'),expires_at:z.string()});
