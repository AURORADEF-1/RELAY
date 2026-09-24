export type Reading<T> = { value: T; at: string | null };
export type JcbFault = { code: string; description: string; severity: string; at: string | null };
export type JcbMachine = {
  source?: "jcb" | "trackunit";
  pin: string;
  equipmentId: string;
  model: string;
  position: { latitude: number; longitude: number; at: string | null } | null;
  hours: Reading<number> | null;
  idleHours: Reading<number> | null;
  fuel: Reading<number> | null;
  adblue: Reading<number> | null;
  engine: Reading<boolean> | null;
};
export type RegistryMachine = { id: string; machine_number: string; serial_number: string | null; make: string | null; model: string | null };
export type LinkedJcbMachine = Pick<JcbMachine, "pin" | "equipmentId" | "model" | "position"> & Partial<Pick<JcbMachine, "hours" | "idleHours" | "fuel" | "adblue" | "engine">> & {
  source?: "jcb" | "trackunit";
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
  const query = new URLSearchParams({ machineReference: machine.relay.machine_number, livelink: machine.pin });
  if (machine.source === "trackunit") query.set("telematics", "trackunit");
  if (faultCode) query.set("livelinkFault", faultCode);
  return `/submit?${query}`;
}

export const machineKey = (machine: LinkedJcbMachine) => `${machine.source ?? "jcb"}:${machine.pin}`;
export const machineBrand = (machine: LinkedJcbMachine) => machine.source === "trackunit" ? "Manitou" : "JCB";
