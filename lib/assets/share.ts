import {z} from 'zod';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {machineBrand,positionAge} from '@/lib/integrations/jcb/types';
import {locationViews} from '@/lib/fleet-map/location-views';
export const assetJobSchema=z.object({requestId:z.string().uuid(),provider:z.enum(['jcb','trackunit','takeuchi','assetcare']),pin:z.string().trim().min(1).max(100),fitterId:z.string().uuid(),jobNumber:z.string().trim().min(1).max(80),breakdown:z.string().trim().min(1).max(3000),contact:z.string().trim().min(1).max(150),phone:z.string().trim().min(6).max(40).regex(/^\+?[\d\s().-]+$/)});
export type AssetJobInput=z.infer<typeof assetJobSchema>;
export function locationShare(m:LinkedJcbMachine){
 if(!locationViews(m.position).length)return null;
 const p=m.position!,url=`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
 const at=p.at&&Number.isFinite(Date.parse(p.at))?new Date(p.at).toLocaleString('en-GB',{timeZone:'Europe/London'})+' UK time':'Time unavailable';
 return {url,text:`${m.relay?.machine_number||m.equipmentId} · ${machineBrand(m)} ${m.model}\nLast reported location: ${at}\n${positionAge(p.at)} — confirm location before travelling.\n${url}`};
}
export function jobDetails(input:AssetJobInput){return `Asset reference: ${input.provider} / ${input.pin}\nJob number: ${input.jobNumber}\nBreakdown: ${input.breakdown}\nSite contact: ${input.contact}\nPhone: ${input.phone}\n\n`;}
