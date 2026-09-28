import { positionSide, DAY } from '@/lib/fleet-operations/report';
import { metres, validPosition } from '@/lib/assets/events';
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
export function stationaryAtBoundary(machine: BoardMachine, now: number): boolean {
  const p=machine.position;
  if(!validPosition(p,now)||now-Date.parse(p!.at!)>DAY)return false;
  // Ignition off alone is insufficient: an asset could be moving on a trailer.
  const time=Date.parse(p!.at!);
  if(machine.transit && Math.abs(Date.parse(machine.transit.at)-time)<=30*60000)return false;
  const previous=[...(machine.positionHistory??[])].filter(q=>validPosition(q,now)&&Date.parse(q.at!)<time).sort((a,b)=>Date.parse(b.at!)-Date.parse(a.at!))[0];
  if(!previous)return false;
  const elapsed=time-Date.parse(previous.at!);
  return elapsed>=60000 && elapsed<=30*60000 && metres(previous,p!)<=10;
}
export function lastKnownSide(machine: BoardMachine, now: number) {
  const p=machine.position;
  if(!usableCoordinates(p,now))return 'unknown';
  // Use geometry without the live-reading freshness gate; never change the saved GPS time.
  const side=positionSide({...p,at:new Date(now).toISOString()},now);
  return side==='unknown' && stationaryAtBoundary(machine,now)?'off_hire':side;
}
