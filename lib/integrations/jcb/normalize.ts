import { z } from "zod";
import type { JcbMachine, RegistryMachine, LinkedJcbMachine } from "./types";

const field = z.record(z.string(), z.unknown()).nullish();
export const equipmentSchema = z.object({
  EquipmentHeader: z.object({ Pin: z.string().min(1), EquipmentId: z.string().nullish(), Model: z.string().nullish() }),
  Location: field, CumulativeOperatingHours: field, CumulativeIdleHours: field,
  FuelUsed: field, FuelUsedLast24: field, FuelRemaining: field, DEFRemaining: field, EngineStatus: field,
});
export const linksSchema = z.array(z.object({ Rel: z.string(), Href: z.string() })).default([]);
export const fleetSchema = z.object({ Equipment: z.array(equipmentSchema), Links: linksSchema });
export const faultsSchema = z.object({ FaultCode: z.array(z.object({
  CodeIdentifier: z.union([z.string(), z.number()]), CodeDescription: z.string().nullish(),
  CodeSeverity: z.string().nullish(), DateTime: z.string().nullish(),
})), Links: linksSchema });

export function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function number(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function numericReading(value: Record<string, unknown> | null | undefined, key: string, max = Infinity) {
  const n = number(value?.[key]);
  return n !== null && n >= 0 && n <= max ? { value: n, at: timestamp(value?.DateTime) } : null;
}
function fuelReading(raw: Record<string, unknown> | null | undefined) {
  if (!['l', 'litre', 'litres', 'liter', 'liters'].includes(String(raw?.FuelUnits ?? '').trim().toLowerCase())) return null;
  return numericReading(raw, 'FuelConsumed');
}
export function normalizeEquipment(raw: z.infer<typeof equipmentSchema>): JcbMachine {
  const lat = number(raw.Location?.Latitude), lon = number(raw.Location?.Longitude);
  return {
    pin: raw.EquipmentHeader.Pin, equipmentId: raw.EquipmentHeader.EquipmentId ?? "", model: raw.EquipmentHeader.Model ?? "JCB",
    position: lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { latitude: lat, longitude: lon, at: timestamp(raw.Location?.DateTime) } : null,
    hours: numericReading(raw.CumulativeOperatingHours, "Hour"), idleHours: numericReading(raw.CumulativeIdleHours, "Hour"),
    fuelUsed: fuelReading(raw.FuelUsed), fuelUsed24h: fuelReading(raw.FuelUsedLast24),
    fuel: numericReading(raw.FuelRemaining, "Percent", 100), adblue: numericReading(raw.DEFRemaining, "Percent", 100),
    engine: typeof raw.EngineStatus?.Running === "boolean" ? { value: raw.EngineStatus.Running, at: timestamp(raw.EngineStatus.DateTime) } : null,
  };
}
const identity = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, "").toUpperCase();
export function linkMachines(machines: JcbMachine[], registry: RegistryMachine[], mappings: { pin: string; machine_id: string }[]): LinkedJcbMachine[] {
  return machines.map(machine => {
    const manual = mappings.find(m => m.pin === machine.pin);
    if (manual) {
      const relay = registry.find(r => r.id === manual.machine_id) ?? null;
      return { ...machine, relay, match: relay ? "confirmed" : "unmatched" };
    }
    const candidates = registry.filter(r => !mappings.some(m => m.machine_id === r.id && m.pin !== machine.pin) && identity(r.make).startsWith("JCB") && (
      identity(r.serial_number) === identity(machine.pin) ||
      (identity(machine.equipmentId) !== "" && identity(r.machine_number) === identity(machine.equipmentId))
    ));
    const relay = candidates.length === 1 ? candidates[0] : null;
    // Do not auto-link two upstream assets to the same RELAY machine.
    const collision = relay && machines.filter(m => identity(m.pin) === identity(relay.serial_number) ||
      (identity(m.equipmentId) !== "" && identity(m.equipmentId) === identity(relay.machine_number))).length > 1;
    return { ...machine, relay: collision ? null : relay, match: collision || candidates.length > 1 ? "ambiguous" : relay ? "exact" : "unmatched" };
  });
}
export function projectMachine(machine: LinkedJcbMachine, admin: boolean): LinkedJcbMachine {
  if (admin) return machine;
  const { pin, equipmentId, model, position, relay, match, source } = machine;
  return { pin, equipmentId, model, position, relay, match, ...(source ? { source } : {}) };
}
