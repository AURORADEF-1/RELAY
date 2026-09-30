import {expect,it} from 'vitest';
import {buildFleetOverview} from '@/lib/assets/overview';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';

const machine=(id:string,latitude:number|null,longitude:number|null,at:string|null,group='Plant'):LinkedJcbMachine=>({source:'assetcare',pin:id,equipmentId:id,model:'Test',relay:{id,machine_number:id,serial_number:null,make:'Test',model:'Test'},match:'confirmed',assetGroup:group,position:latitude===null||longitude===null?null:{latitude,longitude,at}});

it('summarises unique assets against the MLP Yard geofence',()=>{
 const now=Date.parse('2026-09-30T12:00:00Z');
 const result=buildFleetOverview([
  machine('yard',52.392,0.955,'2026-09-30T11:00:00Z'),
  machine('away',52.5,1.1,'2026-09-28T11:00:00Z'),
  machine('missing',null,null,null,'Workshop'),
  machine('yard',52.392,0.955,'2026-09-30T10:00:00Z'),
 ],now);
 expect(result).toMatchObject({total:3,inside:1,outside:1,unknown:1,checkedIn24h:1,over24h:1,neverCheckedIn:1});
 expect(result.groups).toEqual(expect.arrayContaining([expect.objectContaining({name:'Plant',total:2}),expect.objectContaining({name:'Workshop',unknown:1})]));
});
