import {expect,it} from 'vitest';
import {availability,bookingSchema,periodSchema,ukToday,type Booking} from '@/lib/fleet-scheduler/model';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-25T12:00:00Z'),at=new Date(now).toISOString();
const m:LinkedJcbMachine={pin:'p',equipmentId:'100',model:'Excavator',match:'exact',relay:{id:'machine',machine_number:'100',make:'XCMG',model:null,serial_number:null},position:{latitude:52.3925,longitude:.955,at}};
const b:Booking={id:'b',machine_id:'machine',starts_on:'2026-09-25',ends_on:'2026-09-27',job_reference:'J',site:'Site',notes:null,status:'reserved',created_by:'admin',created_at:at};
it('separates geofence availability, reservations, transit and unknown GPS',()=>{
 expect(availability(m,[],'2026-09-25','2026-09-25',now).state).toBe('available');
 expect(availability(m,[b],'2026-09-27','2026-09-27',now).state).toBe('reserved');
 expect(availability(m,[b],'2026-09-28','2026-09-28',now).state).toBe('available');
 expect(availability({...m,position:null},[],'2026-09-25','2026-09-25',now).state).toBe('unknown');
 expect(availability({...m,transit:{at,metres:1000,basis:'GPS movement',provider:'assetcare'}},[],'2026-09-25','2026-09-25',now).state).toBe('transit');
 expect(availability({...m,position:{...m.position!,latitude:52.5}},[],'2026-09-25','2026-09-25',now).state).toBe('away');
 expect(availability(m,[{...b,status:'cancelled'}],'2026-09-25','2026-09-25',now).state).toBe('available');
});
it('does not call stale yard reports available',()=>{expect(availability(m,[],'2026-09-25','2026-09-25',now+86400001).state).toBe('unknown');});
it('validates dates and uses UK calendar days across daylight saving',()=>{expect(periodSchema.safeParse({start:'2026-02-30',end:'2026-03-01'}).success).toBe(false);expect(periodSchema.safeParse({start:'2026-09-25',end:'2026-09-24'}).success).toBe(false);expect(bookingSchema.safeParse({}).success).toBe(false);expect(ukToday(new Date('2026-09-25T23:30:00Z'))).toBe('2026-09-26');});
