import "server-only";
import { unstable_cache } from "next/cache";
import { fleetSchema, faultsSchema, normalizeEquipment, timestamp } from "./normalize";
import type { JcbFault, JcbMachine } from "./types";

const BASE = "https://www.jcbll.com/Live/MixedFleetTelematicsService/";
export class JcbError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
let token: { value: string; expires: number } | null = null;
let tokenPending: Promise<string> | null = null;
export function validateJcbUrl(value: string, prefix = "/Live/MixedFleetTelematicsService/Fleet") {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["jcbll.com", "www.jcbll.com"].includes(url.hostname) ||
      url.port || url.username || url.password || !(url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
    throw new JcbError("JCB returned an unexpected pagination link.");
  }
  return url.toString();
}
async function accessToken() {
  if (token && token.expires > Date.now()) return token.value;
  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
    const username = process.env.JCB_LIVELINK_USERNAME;
    const password = process.env.JCB_LIVELINK_PASSWORD;
    const secret = process.env.JCB_LIVELINK_CLIENT_SECRET;
    if (!username || !password || !secret) throw new JcbError("JCB LiveLink has not been configured yet.", 503);
    const response = await fetch(BASE + "GetToken", { method: "POST", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ username, password, client_secret: secret, client_id: "RELAY", grant_type: "password" }) });
    if (!response.ok) throw new JcbError("JCB authentication failed. Ask an administrator to check the connection.", 503);
    const data = await response.json();
    if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(Number(data.expires_in))) throw new JcbError("JCB returned an invalid authentication response.");
    token = { value: data.access_token, expires: Date.now() + Math.max(1, Number(data.expires_in) - 60) * 1000 };
    return token.value;
  })().finally(() => { tokenPending = null; });
  return tokenPending;
}
async function request(url: string, retry = true, signal?: AbortSignal): Promise<unknown> {
  const safeUrl = validateJcbUrl(url);
  const bearer = await accessToken();
  const response = await fetch(safeUrl, { headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
  if (response.status === 401 && retry) { if (token?.value === bearer) token = null; return request(url, false, signal); }
  if (response.status === 204) return null;
  if (response.status === 429) throw new JcbError("JCB is limiting requests. Please try again later.", 503);
  if (!response.ok) throw new JcbError("JCB could not return machine data. Please try again later.");
  return response.json();
}

export async function fetchJcbFleet(): Promise<{ machines: JcbMachine[]; checkedAt: string }> {
  let url: string | undefined = BASE + "Fleet";
  const seen = new Set<string>(), pins = new Set<string>();
  const machines: JcbMachine[] = [];
  while (url) {
    const canonical = validateJcbUrl(url);
    if (seen.has(canonical) || seen.size >= 50) throw new JcbError("JCB fleet pagination did not complete.");
    seen.add(canonical);
    const parsed = fleetSchema.safeParse(await request(canonical));
    if (!parsed.success) throw new JcbError("JCB returned an invalid fleet response.");
    for (const row of parsed.data.Equipment) {
      const machine = normalizeEquipment(row);
      if (pins.has(machine.pin)) throw new JcbError("JCB returned duplicate machines. Please retry after the next update.");
      pins.add(machine.pin); machines.push(machine);
    }
    url = parsed.data.Links.find(l => l.Rel.toLowerCase() === "next")?.Href;
  }
  return { machines, checkedAt: new Date().toISOString() };
}
export const getJcbFleet = unstable_cache(fetchJcbFleet, ["jcb-fleet-v2-fuel"], { revalidate: 900 });

export async function fetchJcbFaults(pin: string): Promise<{ faults: JcbFault[]; checkedAt: string }> {
  let url: string | undefined = BASE + `Fleet/Equipment/${encodeURIComponent(pin)}/Faults/1`;
  const seen = new Set<string>(); const faults: JcbFault[] = [];
  const deadline = AbortSignal.timeout(35_000);
  while (url) {
    const canonical = validateJcbUrl(url, `/Live/MixedFleetTelematicsService/Fleet/Equipment/${encodeURIComponent(pin)}/Faults`);
    if (seen.has(canonical) || seen.size >= 50) throw new JcbError("JCB fault pagination did not complete.");
    seen.add(canonical);
    const raw = await request(canonical, true, deadline);
    if (raw === null) break;
    const parsed = faultsSchema.safeParse(raw);
    if (!parsed.success) throw new JcbError("JCB returned an invalid fault response.");
    faults.push(...parsed.data.FaultCode.map(f => ({ code: String(f.CodeIdentifier), description: f.CodeDescription ?? "No description supplied", severity: f.CodeSeverity ?? "Unknown", at: timestamp(f.DateTime) })));
    url = parsed.data.Links.find(l => l.Rel.toLowerCase() === "next")?.Href;
  }
  return { faults, checkedAt: new Date().toISOString() };
}
export const getJcbFaults = unstable_cache(fetchJcbFaults, ["jcb-faults-v1"], { revalidate: 900 });
