import {expect,it} from 'vitest';
import {assetJobSchema,locationShare,jobDetails} from '@/lib/assets/share';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const m:LinkedJcbMachine={source:'assetcare',pin:'asset',equipmentId:'12345',model:'Excavator',match:'unmatched',relay:null,position:{latitude:52,longitude:1,at:'2020-01-01T00:00:00Z'}};
it('shares a dated location and warns about old readings',()=>{const s=locationShare(m)!;expect(s.url).toContain('query=52,1');expect(s.text).toContain('01/01/2020');expect(s.text).toContain('confirm location');expect(locationShare({...m,position:null})).toBeNull();expect(locationShare({...m,position:{...m.position!,latitude:NaN}})).toBeNull();});
it('requires complete job and contact details',()=>{expect(assetJobSchema.safeParse({}).success).toBe(false);expect(assetJobSchema.safeParse({requestId:crypto.randomUUID(),provider:'jcb',pin:'a',fitterId:crypto.randomUUID(),jobNumber:' 100 ',breakdown:'Stopped',contact:'Site office',phone:'+44 1234 567890'}).success).toBe(true);});
it('binds retry identity to the asset as well as the job details',()=>{const p={requestId:crypto.randomUUID(),provider:'jcb' as const,pin:'a',fitterId:crypto.randomUUID(),jobNumber:'100',breakdown:'Stopped',contact:'Site',phone:'01234567890'};expect(jobDetails(p)).not.toBe(jobDetails({...p,pin:'b'}));});
