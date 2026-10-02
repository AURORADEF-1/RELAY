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
  // Coordinates and timestamp are valid here, so unknown means the 20 m
  // boundary band. For last-reported wallboard totals, near the yard is in yard.
  return side==='unknown'?'off_hire':side;
}
