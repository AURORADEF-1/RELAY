import yard from '@/lib/fleet-operations/yard.json';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';

type Position = NonNullable<LinkedJcbMachine['position']>;
export type BoardMachine = LinkedJcbMachine & { observedAt?: string | null; positionHistory?: Position[] };
export function usableCoordinates(p: LinkedJcbMachine['position'], now: number): p is Position {
  return !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180
    && (p.latitude!==0 || p.longitude!==0) && (!p.at || (Number.isFinite(Date.parse(p.at)) && Date.parse(p.at)<=now));
}
export function lastKnown(machine: BoardMachine, now: number): BoardMachine {
  if (usableCoordinates(machine.position,now)) return machine;
  const position=[...(machine.positionHistory??[])].filter(p=>usableCoordinates(p,now)).sort((a,b)=>(Date.parse(b.at??'')||0)-(Date.parse(a.at??'')||0))[0]??null;
  return {...machine,position};
}
export function positionOrder(machine: BoardMachine): number {
  const time=Date.parse(machine.position?.at??machine.observedAt??'');
  return Number.isFinite(time)?time:0;
}
export function lastKnownSide(machine: BoardMachine, now: number) {
  const p=machine.position;
  if(!usableCoordinates(p,now))return 'unknown';
  const {longitude:x,latitude:y}=p;
  const ring=yard.geometry.coordinates[0];let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,ay]=ring[j], [bx,by]=ring[i];
    const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    // A point exactly on the yard outline belongs to the yard. No uncertainty band.
    if(Math.abs(cross)<=1e-14 && x>=Math.min(ax,bx) && x<=Math.max(ax,bx) && y>=Math.min(ay,by) && y<=Math.max(ay,by))return 'off_hire';
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside?'off_hire':'on_hire';
}
