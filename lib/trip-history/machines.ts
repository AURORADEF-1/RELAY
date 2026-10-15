import 'server-only';
import type {NextRequest} from 'next/server';
import {fleetForViewer} from '@/lib/fleet-map/requester-server';

export type TripMachine={id:string;name:string;group:string};

export async function tripMachinesForViewer(request:NextRequest):Promise<TripMachine[]>{
 const fleet=await fleetForViewer(request);
 const unique=new Map<string,TripMachine>();
 for(const machine of fleet.machines)if(machine.source==='assetcare'&&!unique.has(machine.pin))unique.set(machine.pin,{id:machine.pin,name:machine.equipmentId||machine.pin,group:machine.assetGroup??'Unmatched'});
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
