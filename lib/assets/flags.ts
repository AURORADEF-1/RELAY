import {z} from 'zod';
import {machineKey,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export type AssetFlag={id:string;asset_key:string;provider:string;pin:string;machine_id:string|null;label:string;reason:string;created_at:string;resolved_at:string|null};
export const flagSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('flag'),id:z.string().uuid(),provider:z.enum(['jcb','trackunit','takeuchi','assetcare']),pin:z.string().trim().min(1).max(200),reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('resolve'),id:z.string().uuid(),resolution:z.string().trim().min(3).max(500)})
]);
export const flagAssetKey=(m:LinkedJcbMachine)=>m.relay?`relay:${m.relay.id}`:machineKey(m);
export const flagForMachine=(flags:AssetFlag[],m:LinkedJcbMachine)=>flags.find(f=>!f.resolved_at&&(f.asset_key===flagAssetKey(m)||f.provider===(m.source??'jcb')&&f.pin===m.pin));
