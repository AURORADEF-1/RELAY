import {notFound} from 'next/navigation';
import {StaffWorkspace} from '@/components/staff/workspace';
import {staffRow} from '@/lib/staff/model';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const time=Date.now();
const examples=[{pin:'demo-1',equipmentId:'DEMO VAN 1 — Alex Example',assetGroup:'Workshop',position:{latitude:52.392,longitude:.955,at:new Date(time-60000).toISOString()}},{pin:'demo-2',equipmentId:'DEMO VAN 2 — Sam Example',assetGroup:'Transport',position:{latitude:52.41,longitude:.98,at:new Date(time-120000).toISOString()}},{pin:'demo-3',equipmentId:'DEMO VAN 3 — Taylor Example',assetGroup:'Plant Office',position:{latitude:52.39,longitude:.952,at:new Date(time-3600000).toISOString()}}] as LinkedJcbMachine[];
export default function Preview(){if(process.env.NODE_ENV==='production')notFound();return <StaffWorkspace preview={{rows:examples.map(m=>staffRow(m,[],time)),checkedAt:new Date(time).toISOString(),warning:null}}/>;}
