import { positionSide } from '@/lib/fleet-operations/report';
import type { LinkedJcbMachine } from '@/lib/integrations/jcb/types';

type Position = NonNullable<LinkedJcbMachine['position']>;
export type BoardMachine = LinkedJcbMachine & { observedAt?: string | null; positionHistory?: Position[]; confirmedYardSide?: 'off_hire' | 'on_hire'; confirmedYardAt?: string };
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
  const at=p.at?Date.parse(p.at):now;
  const side=positionSide({...p,at:new Date(at).toISOString()},at);
  if(side!=='unknown')return side;
  if(machine.confirmedYardSide && Date.parse(machine.confirmedYardAt??'')<=at)return machine.confirmedYardSide;
  const history=[...(machine.positionHistory??[])].filter(v=>usableCoordinates(v,now)&&v.at&&Date.parse(v.at)<=at).sort((a,b)=>Date.parse(b.at!)-Date.parse(a.at!));
  for(const position of history){
    const previous=positionSide(position,Date.parse(position.at!));
    if(previous!=='unknown')return previous;
  }
  return 'unknown';
}
