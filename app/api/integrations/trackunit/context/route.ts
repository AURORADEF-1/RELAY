import type { NextRequest } from "next/server";
import { authorizeTrackunit,getLinkedTrackunitFleet,trackunitError } from "@/lib/integrations/trackunit/server";
import { getTrackunitDetails } from "@/lib/integrations/trackunit/client";
import { latestFaults } from "@/lib/integrations/jcb/health";
import { jcbJson } from "@/lib/integrations/jcb/server";
import { JcbError } from "@/lib/integrations/jcb/client";
export const maxDuration=60;
export async function GET(request:NextRequest){
 try {const auth=await authorizeTrackunit(request);const pin=request.nextUrl.searchParams.get('pin'),code=request.nextUrl.searchParams.get('fault');if(!pin||pin.length>100||(code&&code.length>100))throw new JcbError('Select a valid machine.',400);
 const fleet=await getLinkedTrackunitFleet(auth);const m=fleet.machines.find(m=>m.pin===pin);if(!m?.relay)throw new JcbError('Link this Manitou machine to RELAY before raising a request.',409);
 const lines=[`Manitou Track snapshot — ${new Date().toISOString()}`,`Machine: ${m.relay.machine_number} · ${m.model}`,`Machine reference: ${m.pin}`,`Fleet fetched: ${fleet.checkedAt}`];
 if(m.position)lines.push(`Last-known position: ${m.position.latitude}, ${m.position.longitude}`,`Position reported: ${m.position.at??'Time unavailable'}`);
 if(code){const details=await getTrackunitDetails(pin);if(details.faultError)throw new JcbError('Fault records unavailable. Review the machine again.',503);const faults=latestFaults(details.faults).filter(f=>f.code===code);if(!faults.length)throw new JcbError('The selected fault is no longer in the returned records.',409);lines.push('Reported faults — confirm current state on the machine:',...faults.map(f=>`${f.code}: ${f.description} · Reported ${f.at??'Time unavailable'}`));}
 return jcbJson({machineReference:m.relay.machine_number,text:lines.join('\n')});
 }catch(e){return trackunitError(e);}
}
