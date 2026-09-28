import {expect,it,vi,beforeEach} from 'vitest';
import {NextRequest} from 'next/server';
import {answerRequesterFleet,directionsForPosition} from '@/lib/relay-ai-fleet';
import {isTelematicsQuestion} from '@/lib/relay-ai-telematics';
import {parseRelayAiTicketDraft} from '@/lib/relay-ai-ticket-actions';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
vi.mock('server-only',()=>({}));
const load=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/fleet-map/requester-server',()=>({fleetForViewer:load}));
import {GET} from '@/app/api/fleet/ai/route';
import {JcbError} from '@/lib/integrations/jcb/client';
const now=Date.parse('2026-09-28T12:00:00Z');
const m:LinkedJcbMachine={pin:'x',equipmentId:'26227',model:'Loadall',position:{latitude:52,longitude:1,at:'2026-09-20T10:00:00Z'},relay:null,match:'unmatched',source:'jcb'};
const fleet={machines:[m],sources:[{available:true}]};
beforeEach(()=>vi.resetAllMocks());
it.each(['Where is machine 26227?','Give me directions to machine 26227','directions'])('routes %s without starting a parts ticket',q=>{
 expect(isTelematicsQuestion(q)).toBe(true);expect(parseRelayAiTicketDraft(q,{allowLooseMachineRequest:false})).toBeNull();
});
it('offers directions to an old exact position and retains the GPS date',()=>{
 const a=answerRequesterFleet('Where is 26227?',fleet,now);expect(a.directions?.url).toBe('https://www.google.com/maps/dir/?api=1&destination=52,1');expect(a.text).toContain('20/09/2026');expect(a.text).toContain('old or undated');
});
it('asks for a reference and never invents an inaccessible record',()=>{
 expect(answerRequesterFleet('directions',fleet,now).text).toContain('Which machine');
 const a=answerRequesterFleet('Where is 99999?',fleet,now);expect(a.directions).toBeNull();expect(a.text).toContain('No accessible');
});
it('does not offer directions for missing, invalid or future positions',()=>{
 for(const p of [null,{latitude:0,longitude:0,at:null},{latitude:91,longitude:1,at:null},{latitude:52,longitude:1,at:'2030-01-01'}])expect(directionsForPosition(p,now)).toBeNull();
 expect(answerRequesterFleet('Where is 26227?',{...fleet,machines:[{...m,position:null}]},now).directions).toBeNull();
});
it('avoids ambiguous destinations and warns of partial feeds',()=>{
 expect(answerRequesterFleet('Where is 26227?',{...fleet,machines:[m,{...m,pin:'other'}]},now).directions).toBeNull();
 expect(answerRequesterFleet('fleet summary',{...fleet,sources:[{available:false}]},now).sourceNote).toContain('incomplete');
});
it('keeps director reports and writes restricted',()=>{
 expect(answerRequesterFleet('director summary',fleet,now).text).toContain('administrators');
 expect(answerRequesterFleet('assign tracker 26227',fleet,now).directions).toBeNull();
});
it.each([401,403])('preserves access failure %s',async status=>{
 load.mockRejectedValue(new JcbError('Denied',status));expect((await GET(new NextRequest('https://relay.test/api/fleet/ai?question=where+is+26227'))).status).toBe(status);
});
it('always requests the People-filtered projection and uses private responses',async()=>{
 load.mockResolvedValue(fleet);const r=await GET(new NextRequest('https://relay.test/api/fleet/ai?question=where+is+26227'));
 expect(load).toHaveBeenCalledWith(expect.anything(),true);expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toContain('no-store');expect((await r.json()).directions).not.toBeNull();
});
it('does not turn a total outage into an empty healthy fleet',async()=>{
 load.mockResolvedValue({machines:[],sources:[{available:false}]});expect((await GET(new NextRequest('https://relay.test/api/fleet/ai?question=fleet+summary'))).status).toBe(503);
});
