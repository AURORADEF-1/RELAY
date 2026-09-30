import {machineBrand,machineKey,machineLastReportedAt,machineProvider,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {lastKnownSide,usableCoordinates} from '@/lib/plant-wallboard/positions';
import {currentTransit} from '@/lib/assets/transit';

export type FleetOverviewGroup={name:string;total:number;inside:number;outside:number;unknown:number};
export type FleetOverviewAsset={id:string|null;key:string;label:string;model:string;group:string;reportedAt:string|null;provider:string};
export type FleetOverviewBreakdown={name:string;count:number};
export type FleetOverview={total:number;inside:number;outside:number;unknown:number;checkedIn24h:number;over24h:number;neverCheckedIn:number;groups:FleetOverviewGroup[];coverage:{recent:FleetOverviewAsset[];stale:FleetOverviewAsset[];missing:FleetOverviewAsset[]};movement:{transit:FleetOverviewAsset[];stationary:FleetOverviewAsset[];ignitionOn:FleetOverviewAsset[]};battery:{reported:number;attention:FleetOverviewAsset[];missing:number};attention:{unmatched:number;unlinked:number};distribution:{providers:FleetOverviewBreakdown[];manufacturers:FleetOverviewBreakdown[];categories:FleetOverviewBreakdown[]}};

export function buildFleetOverview(machines:LinkedJcbMachine[],now=Date.now()):FleetOverview{
 const grouped=new Map<string,LinkedJcbMachine[]>();
 for(const machine of machines){
  const id=machine.relay?.id??machineKey(machine);
  grouped.set(id,[...(grouped.get(id)??[]),machine]);
 }
 const groups=new Map<string,FleetOverviewGroup>();
 const coverage:FleetOverview['coverage']={recent:[],stale:[],missing:[]};
 const movement:FleetOverview['movement']={transit:[],stationary:[],ignitionOn:[]},battery:FleetOverview['battery']={reported:0,attention:[],missing:0};
 const providers=new Map<string,number>(),manufacturers=new Map<string,number>(),categories=new Map<string,number>();
 let unmatched=0,unlinked=0;
 let inside=0,outside=0,unknown=0,checkedIn24h=0,over24h=0,neverCheckedIn=0;
 for(const candidates of grouped.values()){
  const latest=[...candidates].sort((a,b)=>Date.parse(machineLastReportedAt(b)??'')-Date.parse(machineLastReportedAt(a)??''))[0];
  const positioned=candidates.filter(machine=>usableCoordinates(machine.position,now)).sort((a,b)=>(Date.parse(b.position?.at??'')||0)-(Date.parse(a.position?.at??'')||0))[0];
  const side=positioned?lastKnownSide(positioned,now):'unknown';
  if(side==='off_hire')inside++;else if(side==='on_hire')outside++;else unknown++;
  const reportedAt=candidates.map(machineLastReportedAt).filter((at):at is string=>!!at&&Number.isFinite(Date.parse(at))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  const name=latest.assetGroup?.trim()||'Unmatched';
  const asset={id:latest.relay?.id??null,key:machineKey(latest),label:latest.relay?.machine_number||latest.equipmentId,model:latest.relay?.model||latest.model,group:name,reportedAt:reportedAt??null,provider:machineProvider(latest)};
  if(!reportedAt){neverCheckedIn++;coverage.missing.push(asset);}else if(now-Date.parse(reportedAt)<=86400000){checkedIn24h++;coverage.recent.push(asset);}else{over24h++;coverage.stale.push(asset);}
  const row=groups.get(name)??{name,total:0,inside:0,outside:0,unknown:0};row.total++;
  if(side==='off_hire')row.inside++;else if(side==='on_hire')row.outside++;else row.unknown++;
  groups.set(name,row);
  const bump=(map:Map<string,number>,key:string)=>map.set(key,(map.get(key)??0)+1);
  bump(providers,asset.provider);bump(manufacturers,machineBrand(latest)||'Unknown');bump(categories,latest.assetCategory||'Unclassified');
  if(name==='Unmatched')unmatched++;if(!latest.relay)unlinked++;
  if(currentTransit(latest,now))movement.transit.push(asset);
  const recentEvidence=reportedAt&&now-Date.parse(reportedAt)<=30*60000;
  if(recentEvidence&&latest.ignition?.value===true)movement.ignitionOn.push(asset);
  if(recentEvidence&&!currentTransit(latest,now)&&(latest.ignition?.value===false||latest.travel?.speedMph===0))movement.stationary.push(asset);
  if(latest.batteryVoltage){battery.reported++;if(latest.batteryVoltage.value<11.8)battery.attention.push(asset);}else battery.missing++;
 }
 for(const assets of Object.values(coverage))assets.sort((a,b)=>(Date.parse(b.reportedAt??'')||0)-(Date.parse(a.reportedAt??'')||0)||a.label.localeCompare(b.label,undefined,{numeric:true}));
 const breakdown=(map:Map<string,number>)=>[...map].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 return {total:grouped.size,inside,outside,unknown,checkedIn24h,over24h,neverCheckedIn,groups:[...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),coverage,movement,battery,attention:{unmatched,unlinked},distribution:{providers:breakdown(providers),manufacturers:breakdown(manufacturers),categories:breakdown(categories)}};
}
