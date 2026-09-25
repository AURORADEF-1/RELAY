export type Reading<T> = { value: T; at: string | null };
export type JcbFault = { code: string; description: string; severity: string; at: string | null };
export type JcbMachine = {
  source?: "jcb" | "trackunit" | "takeuchi" | "assetcare";
  pin: string;
  equipmentId: string;
  model: string;
  position: { latitude: number; longitude: number; at: string | null } | null;
  hours: Reading<number> | null;
  idleHours: Reading<number> | null;
  fuelUsed?: Reading<number> | null;
  fuelUsed24h?: Reading<number> | null;
  fuel: Reading<number> | null;
  adblue: Reading<number> | null;
  engine: Reading<boolean> | null;
};
export type RegistryMachine = { id: string; machine_number: string; serial_number: string | null; make: string | null; model: string | null };
export type LinkedJcbMachine = Pick<JcbMachine, "pin" | "equipmentId" | "model" | "position"> & Partial<Pick<JcbMachine, "hours" | "idleHours" | "fuel" | "adblue" | "engine" | "fuelUsed" | "fuelUsed24h">> & {
  source?: "jcb" | "trackunit" | "takeuchi" | "assetcare";
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
  if(machine.source === "assetcare") return `/submit?${new URLSearchParams({machineReference:machine.relay.machine_number,asset:machine.relay.id})}`;
  const query = new URLSearchParams({ machineReference: machine.relay.machine_number, livelink: machine.pin });
  if (machine.source && machine.source !== "jcb") query.set("telematics", machine.source);
  if (faultCode) query.set("livelinkFault", faultCode);
  return `/submit?${query}`;
}

export const machineKey = (machine: LinkedJcbMachine) => `${machine.source ?? "jcb"}:${machine.pin}`;
export const machineProvider = (machine: LinkedJcbMachine) => machine.source === "assetcare" ? "Asset Care+" : machine.source === "takeuchi" ? "Takeuchi" : machine.source === "trackunit" ? "Manitou" : "JCB";

export const machineBrand = (machine: LinkedJcbMachine) => machine.source === "assetcare" ? machine.relay?.make?.trim() || machineProvider(machine) : machineProvider(machine);
