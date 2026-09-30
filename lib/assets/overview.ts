import {machineKey,machineLastReportedAt,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {lastKnownSide,usableCoordinates} from '@/lib/plant-wallboard/positions';

export type FleetOverviewGroup={name:string;total:number;inside:number;outside:number;unknown:number};
export type FleetOverview={total:number;inside:number;outside:number;unknown:number;checkedIn24h:number;over24h:number;neverCheckedIn:number;groups:FleetOverviewGroup[]};

export function buildFleetOverview(machines:LinkedJcbMachine[],now=Date.now()):FleetOverview{
 const grouped=new Map<string,LinkedJcbMachine[]>();
 for(const machine of machines){
  const id=machine.relay?.id??machineKey(machine);
  grouped.set(id,[...(grouped.get(id)??[]),machine]);
 }
 const groups=new Map<string,FleetOverviewGroup>();
 let inside=0,outside=0,unknown=0,checkedIn24h=0,over24h=0,neverCheckedIn=0;
 for(const candidates of grouped.values()){
  const latest=[...candidates].sort((a,b)=>Date.parse(machineLastReportedAt(b)??'')-Date.parse(machineLastReportedAt(a)??''))[0];
  const positioned=candidates.filter(machine=>usableCoordinates(machine.position,now)).sort((a,b)=>(Date.parse(b.position?.at??'')||0)-(Date.parse(a.position?.at??'')||0))[0];
  const side=positioned?lastKnownSide(positioned,now):'unknown';
  if(side==='off_hire')inside++;else if(side==='on_hire')outside++;else unknown++;
  const reportedAt=candidates.map(machineLastReportedAt).filter((at):at is string=>!!at&&Number.isFinite(Date.parse(at))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  if(!reportedAt)neverCheckedIn++;else if(now-Date.parse(reportedAt)<=86400000)checkedIn24h++;else over24h++;
  const name=latest.assetGroup?.trim()||'Unmatched';
  const row=groups.get(name)??{name,total:0,inside:0,outside:0,unknown:0};row.total++;
  if(side==='off_hire')row.inside++;else if(side==='on_hire')row.outside++;else row.unknown++;
  groups.set(name,row);
 }
 return {total:grouped.size,inside,outside,unknown,checkedIn24h,over24h,neverCheckedIn,groups:[...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name))};
}
