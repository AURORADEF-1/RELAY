vi.mock('@/lib/integrations/request-guard',()=>({cachedProvider:async(_provider:string,_key:string,load:()=>Promise<unknown>)=>({data:await load(),checkedAt:new Date().toISOString()}),guardedFetch:async(_provider:string,load:()=>Promise<Response>)=>load()}));
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {normalizeUnit,linkTrackunitMachines,applyTelemetry,normalizeFault} from '@/lib/integrations/trackunit/normalize';
import {partsRequestUrl,machineKey} from '@/lib/integrations/jcb/types';
import {projectMachine} from '@/lib/integrations/jcb/normalize';
vi.mock('server-only',()=>({}));vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn}));
import {fetchTrackunitFleet,fetchTrackunitDetails} from '@/lib/integrations/trackunit/client';
const raw={id:'device1',name:'25462',referenceNumber:'MAN00000C01167000',gpsFixTime:'2026-09-24T10:00:00Z',location:{latitude:52,longitude:1}};
const machine=normalizeUnit(raw),registry=[{id:'r1',machine_number:'25462',serial_number:raw.referenceNumber,make:'MANITOU',model:'MT735'}];
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Trackunit identity and units',()=>{
 it('uses machine reference rather than tracker serial and leaves unreported model/hours unknown',()=>{expect(machine.pin).toBe(raw.referenceNumber);expect(machine.hours).toBeNull();expect(machine.model).toBe('Model not supplied');});
 it('rejects null island and invalid coordinates',()=>{expect(normalizeUnit({...raw,location:{latitude:0,longitude:0}}).position).toBeNull();expect(normalizeUnit({...raw,location:{latitude:91,longitude:1}}).position).toBeNull();});
 it('links exact Manitou serial only and preserves verified model',()=>{const m=linkTrackunitMachines([machine],registry,[])[0];expect(m.relay?.id).toBe('r1');expect(m.model).toBe('MT735');expect(m).not.toHaveProperty('unitId');});
 it('does not use a matching fleet number to override conflicting serials',()=>{expect(linkTrackunitMachines([machine],[{...registry[0],serial_number:'OTHER'}],[])[0].relay).toBeNull();});
 it('rejects ambiguous and other manufacturer records',()=>{expect(linkTrackunitMachines([machine],[...registry,{...registry[0],id:'r2'}],[])[0].match).toBe('ambiguous');expect(linkTrackunitMachines([machine],[{...registry[0],make:'JCB'}],[])[0].relay).toBeNull();});
 it('retains explicit manual links and prevents duplicate automatic links',()=>{expect(linkTrackunitMachines([machine],[{...registry[0],serial_number:'OTHER'}],[{pin:machine.pin,machine_id:'r1'}])[0].match).toBe('confirmed');expect(linkTrackunitMachines([machine,{...machine,pin:'OTHER',unitId:'device2'}],registry,[])[0].relay).toBeNull();});
 it('preserves zero and requires known units',()=>{const enriched=applyTelemetry(machine,[{name:'Fuel Level',value:'0',uoM:'%',time:raw.gpsFixTime},{name:'Total Machine Hours',value:'100',uoM:'hr',time:raw.gpsFixTime}]);expect(enriched.fuel?.value).toBe(0);expect(enriched.hours?.value).toBe(100);expect(applyTelemetry(machine,[{name:'Fuel Level',value:'10',uoM:'litres'}]).fuel).toBeNull();expect(applyTelemetry(machine,[{name:'Fuel Level',value:'',uoM:'%'}]).fuel).toBeNull();});
 it('keeps SPN and FMI separate from severity and does not invent a diagnosis',()=>{expect(normalizeFault({spn:12,fmi:3,time:raw.gpsFixTime})).toMatchObject({code:'SPN 12 / FMI 3',severity:'Not supplied',description:'No description supplied'});});
 it('routes requests to the correct provider and isolates combined map identities',()=>{const m=linkTrackunitMachines([machine],registry,[])[0];expect(partsRequestUrl(m,'SPN 12 / FMI 3')).toContain('telematics=trackunit');expect(machineKey(m)).not.toBe(machineKey({...m,source:'jcb'}));const fitter=projectMachine({...m,fuel:{value:2,at:null}},false);expect(fitter.source).toBe('trackunit');expect(fitter).not.toHaveProperty('fuel');});
});
describe('Trackunit transport',()=>{
 beforeEach(()=>vi.stubEnv('TRACKUNIT_API_KEY','test-secret'));
 it('rejects malformed and duplicate fleet identities',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({list:[raw,raw]})));await expect(fetchTrackunitFleet()).rejects.toThrow('duplicate');});
 it('never forwards credential-bearing redirects and sanitises errors',async()=>{const f=vi.fn().mockRejectedValue(new Error('https://provider/?token=test-secret'));vi.stubGlobal('fetch',f);await expect(fetchTrackunitFleet()).rejects.toThrow('Manitou Track could not return data');expect(f.mock.calls[0][1].redirect).toBe('error');});
 it('uses a bounded dated fault range and reports partial telemetry failure',async()=>{const f=vi.fn(async(url:URL)=>url.pathname.endsWith('/unit')?json({list:[raw]}):url.pathname.endsWith('GetUnitExtendedInfo')?json({},503):json({list:[{spn:1,fmi:2,time:raw.gpsFixTime}]}));vi.stubGlobal('fetch',f);const d=await fetchTrackunitDetails(machine.pin);expect(d.telemetryError).toBe(true);expect(d.faultError).toBe(false);const u=f.mock.calls.map(c=>c[0]).find(u=>u.pathname.includes('ActiveFaults'))!;expect(Date.parse(u.searchParams.get('To')!)-Date.parse(u.searchParams.get('From')!)).toBe(7*86400000);});
 it('rejects an arbitrary unit before requesting private telemetry',async()=>{const f=vi.fn().mockResolvedValue(json({list:[raw]}));vi.stubGlobal('fetch',f);await expect(fetchTrackunitDetails('unknown')).rejects.toMatchObject({status:404});expect(f).toHaveBeenCalledTimes(1);});
});
