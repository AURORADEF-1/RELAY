import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {travelSummary} from '@/lib/assets/travel';
import {normalizeAssetCare} from '@/lib/integrations/assetcare/normalize';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-28T12:00:00Z'),at=new Date(now).toISOString();
const m={pin:'demo',equipmentId:'Demo',model:'Demo',relay:null,match:'unmatched',position:{latitude:52,longitude:1,at}} as LinkedJcbMachine;
it('converts vendor km/h and heading to mph and compass direction with road',()=>{
 const raw={owner:{id:'o'},type:'telemetry',asset:{id:'a'},date:at,location:{lat:52,lon:1,speed:106.216704,heading:90,gc:{rt:'A140',rd:'Road'}}};
 const machine=normalizeAssetCare(raw,'o',now)!.machine;
 expect(travelSummary(machine,[],now).text).toBe('Travelling 66 mph East · A140');
 expect(travelSummary(machine,[],now+6*60000).text).toContain('Last recorded:');
 expect(travelSummary(normalizeAssetCare({...raw,location:{...raw.location,age:1}},'o',now)!.machine,[],now).lastKnown).toBe(true);
});
it('does not imply movement when stopped or invent a road or speed',()=>{
 expect(travelSummary({...m,travel:{heading:0,speedMph:0,road:null,at}},[],now).text).toBe('Stationary at last report');
 expect(travelSummary({...m,travel:{heading:0,speedMph:null,road:null,at}},[],now).text).toBe('Heading North');
 expect(travelSummary({...m,travel:{heading:999,speedMph:-1,road:null,at}},[],now).text).toContain('not supplied');
 expect(travelSummary({...m,travel:{heading:0,speedMph:60,road:null,at:new Date(now+60000).toISOString()}},[],now).text).toContain('not supplied');
});
it('estimates direction only from distinct plausible GPS movement, never instantaneous speed',()=>{
 const previous={latitude:51.999,longitude:1,at:new Date(now-60000).toISOString()};
 const s=travelSummary(m,[previous],now);expect(s.text).toContain('North');expect(s.estimated).toBe(true);expect(s.text).not.toContain('mph');
 expect(travelSummary(m,[{...previous,at:new Date(now-3*3600000).toISOString()}],now).estimated).toBe(false);
 expect(travelSummary(m,[{...m.position!,at:previous.at}],now).text).toContain('not supplied');
 expect(travelSummary(m,[{...previous,latitude:40}],now).estimated).toBe(false);
});
