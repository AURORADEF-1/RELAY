import {expect,it} from 'vitest';
import {costCentreColour} from '@/lib/fleet-map/cost-centre-colours';

it('uses the agreed fleet map colours for each cost centre',()=>{
 expect(Object.fromEntries(['Hydraulic Services','Operators','Plant','Plant Office','Transport','Workshop','Yard','Non Shared'].map(group=>[group,costCentreColour(group)]))).toEqual({
  'Hydraulic Services':'#8b5cf6',Operators:'#2563eb',Plant:'#ef4444','Plant Office':'#64748b',Transport:'#f97316',Workshop:'#ec4899',Yard:'#38bdf8','Non Shared':'#808000',
 });
});
