import "server-only";
import {cachedProvider,guardedFetch} from "../request-guard";
import { z } from "zod";
import { JcbError } from "../jcb/client";
import { unitSchema, normalizeUnit, telemetrySchema, faultSchema, normalizeFault } from "./normalize";
async function loadRequest(path:"unit"|"GetUnitExtendedInfo"|"report/unitActiveFaults", params:Record<string,string>={}) {
  const token=process.env.TRACKUNIT_API_KEY;
  if(!token)throw new JcbError("Manitou Track has not been configured.",503);
  const url=new URL(`https://api.trackunit.com/public/${path}`);
  url.search=new URLSearchParams({...params,format:"json",token}).toString();
  // Classic Trackunit accepts its key in the query. Never log the URL or raw errors.
  try {
    const response=await guardedFetch("trackunit",()=>fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000),headers:{Accept:"application/json"}}));
    if(!response.ok)throw new Error();
    const data=await response.json();
    if(data?.responseStatus?.errorCode)throw new Error();
    return data;
  } catch {throw new JcbError("Manitou Track could not return data. Please try again later.",503);}
}
function request(path:"unit"|"GetUnitExtendedInfo"|"report/unitActiveFaults",params:Record<string,string>={}) {
 return cachedProvider('trackunit',`${path}:${params.Id||'fleet'}`,()=>loadRequest(path,params));
}
export async function fetchTrackunitFleet(){
  const snapshot=await request("unit");
  const parsed=z.object({list:z.array(unitSchema).max(10000)}).safeParse(snapshot.data);
  if(!parsed.success)throw new JcbError("Manitou returned an invalid fleet response.");
  const machines=parsed.data.list.map(normalizeUnit);
  if(new Set(machines.map(m=>m.pin)).size!==machines.length || new Set(machines.map(m=>m.unitId)).size!==machines.length)throw new JcbError("Manitou returned duplicate machine identities.");
  return {machines,checkedAt:snapshot.checkedAt};
}
export const getTrackunitFleet=fetchTrackunitFleet;
export async function fetchTrackunitDetails(pin:string){
  const fleet=await getTrackunitFleet();const machine=fleet.machines.find(m=>m.pin===pin);
  if(!machine)throw new JcbError("Machine not found in the Manitou fleet.",404);
  const now=new Date();
  const [values,reports]=await Promise.allSettled([
    request("GetUnitExtendedInfo",{Id:machine.unitId}),
    request("report/unitActiveFaults",{Id:machine.unitId,From:new Date(now.getTime()-7*86400000).toISOString(),To:now.toISOString()}),
  ]);
  const telemetry=values.status==='fulfilled'?z.object({result:z.array(telemetrySchema)}).safeParse(values.value.data):null;
  const faults=reports.status==='fulfilled'?z.object({list:z.array(faultSchema)}).safeParse(reports.value.data):null;
  return {telemetry:telemetry?.success?telemetry.data.result:[],faults:faults?.success?faults.data.list.map(normalizeFault):[],telemetryError:!telemetry?.success,faultError:!faults?.success,checkedAt:reports.status==='fulfilled'?reports.value.checkedAt:now.toISOString()};
}
export const getTrackunitDetails=fetchTrackunitDetails;

export async function fetchTrackunitTelemetry(unitId:string){
  const parsed=z.object({result:z.array(telemetrySchema)}).safeParse((await request("GetUnitExtendedInfo",{Id:unitId})).data);
  if(!parsed.success)throw new JcbError("Manitou telemetry is unavailable.");
  return parsed.data.result;
}
