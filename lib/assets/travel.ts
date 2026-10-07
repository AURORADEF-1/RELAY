import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {metres,validPosition} from './events';
export type TravelReading={heading:number|null;speedMph:number|null;road:string|null;at:string|null};
export type TravelSummary={text:string;at:string|null;estimated:boolean;lastKnown:boolean};
const direction=(degrees:number)=>['North','Northeast','East','Southeast','South','Southwest','West','Northwest'][Math.round(degrees/45)%8];
export function travelSummary(machine:LinkedJcbMachine,history:NonNullable<LinkedJcbMachine['position']>[]=[],now=Date.now()):TravelSummary{
 const t=machine.travel,age=now-Date.parse(t?.at??'');
 if(t&&(!t.at||Number.isFinite(age)&&age>=0)){
  const speed=t.speedMph!==null&&Number.isFinite(t.speedMph)&&t.speedMph>=0&&t.speedMph<=150?t.speedMph:null;
  const heading=t.heading!==null&&Number.isFinite(t.heading)&&t.heading>=0&&t.heading<360?direction(t.heading):null;
  const lastKnown=!t.at||age>5*60000;
  if(speed!==null||heading){
   const stopped=speed!==null&&speed<1;
   const text=stopped?'Stationary at Last Report':speed!==null?`Travelling ${Math.round(speed)} mph${heading?` ${heading}`:''}`:`Heading ${heading}`;
   return {text:`${lastKnown&&!stopped?'Last recorded: ':''}${text}${t.road?` · ${t.road}`:''}`,at:t.at,estimated:false,lastKnown};
  }
 }
 const points=[...new Map([...history,...(machine.position?[machine.position]:[])].filter(p=>validPosition(p,now)).map(p=>[p.at!,p])).values()].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 const b=points.at(-1),a=points.at(-2);
 if(a&&b){const elapsed=Date.parse(b.at!)-Date.parse(a.at!),distance=metres(a,b);
  if(elapsed>=10000&&elapsed<=2*3600000&&distance>=50&&distance/(elapsed/3600000)<=240000){
   const rad=Math.PI/180,lat1=a.latitude*rad,lat2=b.latitude*rad,dlon=(b.longitude-a.longitude)*rad;
   const degrees=(Math.atan2(Math.sin(dlon)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlon))/rad+360)%360;
   return {text:`Last recorded movement: ${direction(degrees)} · estimated between GPS reports`,at:b.at,estimated:true,lastKnown:true};
  }
 }
 return {text:'Travel direction and speed not supplied',at:t?.at??machine.position?.at??null,estimated:false,lastKnown:true};
}
