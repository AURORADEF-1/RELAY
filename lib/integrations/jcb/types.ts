export type Reading<T> = { value: T; at: string | null };
export type JcbFault = { code: string; description: string; severity: string; at: string | null };
export type JcbMachine = {
  source?: "jcb" | "trackunit" | "takeuchi" | "assetcare" | "signwatch" | "roam";
  pin: string;
  equipmentId: string;
  model: string;
  position: { latitude: number; longitude: number; at: string | null; address?: string | null } | null;
  hours: Reading<number> | null;
  idleHours: Reading<number> | null;
  fuelUsed?: Reading<number> | null;
  fuelUsed24h?: Reading<number> | null;
  fuel: Reading<number> | null;
  adblue: Reading<number> | null;
  engine: Reading<boolean> | null;
  batteryVoltage?: Reading<number> | null;
};
export type RegistryMachine = { id: string; machine_number: string; serial_number: string | null; make: string | null; model: string | null };
export type LinkedJcbMachine = Pick<JcbMachine, "pin" | "equipmentId" | "model" | "position"> & Partial<Pick<JcbMachine, "hours" | "idleHours" | "fuel" | "adblue" | "engine" | "fuelUsed" | "fuelUsed24h" | "batteryVoltage">> & {
  lastReportedAt?: string | null;
  nameOverride?: string;
  source?: "jcb" | "trackunit" | "takeuchi" | "assetcare" | "signwatch" | "roam";
  roamHire?: {id:string;reference:string;site:string;locationType:'site'|'delivery';fleet:string};
  roamMake?:string;
  assetcareReadings?: import('../trackunit/normalize').Telemetry[];
  travel?: import('@/lib/assets/travel').TravelReading | null;
  ignition?: Reading<boolean> | null;
  odometer?: Reading<number> | null;
  transit?: import('@/lib/assets/transit').Transit | null;
  assetGroup?: string;
  assetCategory?: string;
  relay: RegistryMachine | null;
  match: "confirmed" | "exact" | "unmatched" | "ambiguous";
};
export type JcbFleetResponse = { machines: LinkedJcbMachine[]; checkedAt: string; admin: boolean; stale: boolean };

export function positionAge(at: string | null | undefined, now = Date.now()) {
  if (!at || !Number.isFinite(Date.parse(at))) return "Unknown age";
  const hours = (now - Date.parse(at)) / 3_600_000;
  if (hours < 0) return "Check timestamp";
  if (hours >= 48) return "Position out of date";
  if (hours >= 24) return "Over 24 hours old";
  return "Reported within 24 hours";
}

export function partsRequestUrl(machine: LinkedJcbMachine, faultCode?: string) {
  if (!machine.relay) return null;
  if((machine.source === "assetcare" || machine.source === "roam")) return `/submit?${new URLSearchParams({machineReference:machine.relay.machine_number,asset:machine.relay.id})}`;
  const query = new URLSearchParams({ machineReference: machine.relay.machine_number, livelink: machine.pin });
  if (machine.source && machine.source !== "jcb") query.set("telematics", machine.source);
  if (faultCode) query.set("livelinkFault", faultCode);
  return `/submit?${query}`;
}

export const machineKey = (machine: LinkedJcbMachine) => `${machine.source ?? "jcb"}:${machine.pin}`;
export function machineLastReportedAt(machine:LinkedJcbMachine){
  const times=[machine.lastReportedAt,machine.position?.at,machine.travel?.at,machine.batteryVoltage?.at,machine.hours?.at,machine.idleHours?.at,machine.fuel?.at,machine.adblue?.at,machine.engine?.at,machine.ignition?.at,machine.odometer?.at]
    .filter((at):at is string=>typeof at==='string'&&Number.isFinite(Date.parse(at)));
  return times.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
}
export const machineProvider = (machine: LinkedJcbMachine) => machine.source === "roam" ? "ROAM" : machine.source === "signwatch" ? "Sign Watch" : machine.source === "assetcare" ? "Asset Care+" : machine.source === "takeuchi" ? "Takeuchi" : machine.source === "trackunit" ? "Manitou" : "JCB";

export const machineBrand = (machine: LinkedJcbMachine) => machine.source === "roam" ? machine.relay?.make || machine.roamMake || "Unknown make" : machine.source === "assetcare" ? machine.relay?.make?.trim() || machineProvider(machine) : machineProvider(machine);

const assetAcronyms=new Set([
  'GPS','HSR','JCB','LB','MLP','PIN','SH','SR','VCW','XCMG',
]);

/**
 * Formats human-readable asset names without damaging manufacturers and model
 * codes. Words use title case, known letter-only acronyms stay uppercase, and
 * any token containing both letters and numbers is treated as a model code.
 */
export function titleCaseAssetText(value:string){
  return value.toLocaleLowerCase('en-GB').replace(/[a-z0-9]+(?:-[a-z0-9]+)*/g,token=>{
    const upper=token.toLocaleUpperCase('en-GB');
    if(assetAcronyms.has(upper)||(/[a-z]/i.test(token)&&/\d/.test(token)))return upper;
    return token.split('-').map(part=>{const partUpper=part.toLocaleUpperCase('en-GB');return assetAcronyms.has(partUpper)||(/[a-z]/i.test(part)&&/\d/.test(part))?partUpper:part?`${part[0].toLocaleUpperCase('en-GB')}${part.slice(1)}`:part;}).join('-');
  });
}

export function titleCaseAssetLabel(value:string){
  const separator=value.match(/^(.*?)(\s+[·-]\s+)(.+)$/);
  if(separator)return `${separator[1]}${separator[2]}${titleCaseAssetText(separator[3])}`;
  const identifier=value.match(/^(\S*\d\S*)(\s+)(.+)$/);
  return identifier?`${identifier[1]}${identifier[2]}${titleCaseAssetText(identifier[3])}`:titleCaseAssetText(value);
}
