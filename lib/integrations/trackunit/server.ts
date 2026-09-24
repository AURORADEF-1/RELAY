import "server-only";
import type { NextRequest } from "next/server";
import { authorizeJcb, getRegistry, jcbJson } from "../jcb/server";
import { JcbError } from "../jcb/client";
import { projectMachine } from "../jcb/normalize";
import { getTrackunitFleet } from "./client";
import { linkTrackunitMachines } from "./normalize";
export const authorizeTrackunit=(request:NextRequest,adminOnly=false)=>authorizeJcb(request,adminOnly,"trackunit");
export async function getLinkedTrackunitFleet(auth:Awaited<ReturnType<typeof authorizeTrackunit>>){
  const [fleet,registry,mappings]=await Promise.all([getTrackunitFleet(),getRegistry(auth),auth.supabase.from('trackunit_mappings').select('pin,machine_id').order('pin').limit(10000)]);
  if(mappings.error||(mappings.data?.length??0)>=10000)throw new JcbError('Manitou machine linking is unavailable.',503);
  return {machines:linkTrackunitMachines(fleet.machines,registry,mappings.data??[]).map(m=>projectMachine(m,auth.admin)),checkedAt:fleet.checkedAt,admin:auth.admin,stale:Date.now()-Date.parse(fleet.checkedAt)>1200000};
}
export function trackunitError(error:unknown){return jcbJson({error:error instanceof JcbError?error.message:'Manitou Track is temporarily unavailable.'},error instanceof JcbError?error.status:503);}
