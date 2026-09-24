import {expect,it} from 'vitest';
import {openRequestsByFleet,type FleetRequestTicket} from '@/lib/fleet-operations/parts-requests';
const machines=[{id:'a',machine_number:'21299'},{id:'b',machine_number:'22041'}];
const ticket: FleetRequestTicket={id:'request',job_number:'R123',status:'ORDERED',machine_number_normalized:null,machine_number:null,machine_reference:' 21299 ',is_retail_sale:false};
it('matches exact fleet numbers and returns only safe request link fields',()=>{expect(openRequestsByFleet([ticket],machines).get('21299')).toEqual([{id:'request',jobNumber:'R123',status:'ORDERED'}]);});
it('counts ready, ordered and pending requests without completed or retail requests',()=>{const tickets=['READY','ORDERED','PENDING','COMPLETED','CANCELLED'].map(status=>({...ticket,id:status,status}));tickets.push({...ticket,id:'retail',is_retail_sale:true});expect(openRequestsByFleet(tickets,machines).get('21299')).toHaveLength(3);});
it('uses verified number before free text and never substring-matches another machine',()=>{expect(openRequestsByFleet([{...ticket,machine_number_normalized:'22041'}],machines).get('22041')).toHaveLength(1);expect(openRequestsByFleet([{...ticket,machine_reference:'121299'}],machines).size).toBe(0);});
it('does not double count requests or flag ambiguous fleet-register identities',()=>{expect(openRequestsByFleet([ticket,ticket],machines).get('21299')).toHaveLength(1);expect(openRequestsByFleet([ticket],[...machines,{id:'other',machine_number:'21299'}]).size).toBe(0);});
