import {expect,it} from 'vitest';
import {lastKnownSide,type BoardMachine} from '@/lib/plant-wallboard/positions';
import yard from '@/lib/fleet-operations/yard.json';
const now=Date.parse('2026-09-28T12:00:00Z');
const machine:BoardMachine={pin:'a',equipmentId:'a',model:'a',relay:null,match:'unmatched',position:null};
it('counts both sides of the 20 metre boundary buffer as in yard',()=>{
 const ring=yard.geometry.coordinates[0], [a,b]=[ring[0],ring[1]];
 const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),epsilon=.000001;
 const sides=[-1,1].map(sign=>lastKnownSide({...machine,position:{longitude:x+sign*dy/length*epsilon,latitude:y-sign*dx/length*epsilon,at:null}},now));
 expect(sides).toEqual(['off_hire','off_hire']);
 expect(lastKnownSide({...machine,position:{longitude:x,latitude:y,at:null}},now)).toBe('off_hire');
 for(const side of ['off_hire','on_hire'] as const)expect(lastKnownSide({...machine,confirmedYardSide:side,confirmedYardAt:'2026-09-27T12:00:00Z',position:{longitude:x,latitude:y,at:null}},now)).toBe('off_hire');
});
it('uses old coordinates and does not require motion or ignition evidence',()=>{
 expect(lastKnownSide({...machine,position:{latitude:52.392,longitude:.955,at:'2020-01-01T00:00:00Z'}},now)).toBe('off_hire');
 expect(lastKnownSide({...machine,position:{latitude:52,longitude:1,at:null}},now)).toBe('on_hire');
});
it('retains unknown for missing or invalid coordinates',()=>{
 expect(lastKnownSide(machine,now)).toBe('unknown');
 expect(lastKnownSide({...machine,position:{latitude:0,longitude:0,at:null}},now)).toBe('unknown');
});

it('limits the in-yard buffer to 20 metres instead of absorbing nearby outside positions',()=>{
 const [a,b]=yard.geometry.coordinates[0];
 const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,sx=111320*Math.cos(y*Math.PI/180),sy=111320;
 const dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy,length=Math.hypot(dx,dy);
 const sides=(metres:number)=>[-1,1].map(sign=>lastKnownSide({...machine,position:{longitude:x+sign*dy/length*metres/sx,latitude:y-sign*dx/length*metres/sy,at:null}},now)).sort();
 expect(sides(19.9)).toEqual(['off_hire','off_hire']);
 expect(sides(21)).toEqual(['off_hire','on_hire']);
});
