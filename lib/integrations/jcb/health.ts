import type { JcbFault, LinkedJcbMachine } from "./types";
export type Priority = "urgent" | "review" | "info";
export type HealthIssue = { key: string; priority: Priority; title: string; detail: string; action: string; at: string | null; notify: boolean; code?: string };
export type HealthRow = { machine: LinkedJcbMachine; issues: HealthIssue[]; faults: JcbFault[]; checkedAt: string; faultError: boolean };
const DAY = 86_400_000;
export function readingAge(at: string | null | undefined, now: number) {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time <= now ? now - time : null;
}
export function faultAdvice(fault: JcbFault, now = Date.now()): HealthIssue {
  const age = readingAge(fault.at, now);
  const recent = age !== null && age <= 7 * DAY;
  const severe = /^(critical|major|severe|fatal)$/i.test(fault.severity.trim());
  const priority: Priority = recent ? severe ? "urgent" : "review" : "info";
  return {
    key: `fault:${fault.code}:${fault.severity.toLowerCase()}`,
    code: fault.code, priority,
    title: !recent ? "Historical / undated fault" : severe ? "Priority inspection" : "Check reported fault",
    detail: fault.description === "No description supplied" ? "The provider supplied a code without an explanation. Check the machine display and the correct model's fault guide." : fault.description,
    action: !recent ? "Check the machine display and maintenance history to confirm whether this fault was resolved."
      : severe ? "Contact the operator promptly. Check the machine display; if a stop warning or unsafe behaviour is present, stop safely and arrange a qualified inspection."
      : "Ask the operator about symptoms, check the machine display and arrange a fitter inspection if the warning remains. Confirm the cause before ordering parts.",
    at: fault.at, notify: recent && age! <= DAY,
  };
}
export function latestFaults(faults: JcbFault[]) {
  const result = new Map<string, JcbFault>();
  for (const fault of faults) {
    const key = `${fault.code}:${fault.severity.toLowerCase()}`;
    const previous = result.get(key);
    if (!previous || (Date.parse(fault.at ?? "") || 0) > (Date.parse(previous.at ?? "") || 0)) result.set(key, fault);
  }
  return [...result.values()].sort((a,b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0));
}
export function assessMachine(machine: LinkedJcbMachine, faults: JcbFault[], faultError = false, now = Date.now()): HealthRow {
  const issues = latestFaults(faults).map(f => faultAdvice(f, now));
  for (const [key, label, reading, threshold] of [["fuel", "Fuel", machine.fuel, 15], ["adblue", "AdBlue", machine.adblue, 10]] as const) {
    const age = readingAge(reading?.at, now);
    if (reading && age !== null && age <= DAY && reading.value <= threshold) issues.push({ key, priority: "review", title: `Low ${label}`, detail: `${reading.value}% reported; review threshold ${threshold}%.`, action: `Confirm the level with the operator and plan a ${label === "Fuel" ? "refuelling" : "correct-specification AdBlue top-up"} before the next shift. Follow the machine handbook.`, at: reading.at, notify: true });
    else if (reading && (age === null || age > DAY)) issues.push({key:`stale:${key}`,priority:"info",title:`${label} reading needs updating`,detail:"The reading is older than 24 hours or has no valid timestamp.",action:"Check the current level on the machine; do not plan replenishment from an old reading.",at:reading.at,notify:false});
  }
  const positionAge = readingAge(machine.position?.at, now);
  if (positionAge === null || positionAge > 2 * DAY) issues.push({key:"position",priority:"review",title:"Location needs checking",detail:"No valid position reported within 48 hours.",action:"Contact the operator to confirm the location and check the telematics connection before sending a fitter.",at:machine.position?.at ?? null,notify:true});
  if (faultError) issues.push({key:"connection",priority:"review",title:"Fault check unavailable",detail:"The provider could not return this machine's fault records.",action:"Retry the report and check directly with the operator. Missing data does not mean the machine is clear.",at:null,notify:false});
  return {machine, faults:latestFaults(faults), issues:issues.sort((a,b)=>priorityRank(a.priority)-priorityRank(b.priority)),checkedAt:new Date(now).toISOString(),faultError};
}
export const priorityRank = (priority: Priority) => ({urgent:0,review:1,info:2})[priority];
export function healthLabel(row: HealthRow) { return row.issues.some(i=>i.priority==="urgent") ? "Priority inspection" : row.issues.some(i=>i.priority==="review") ? "Needs review" : row.issues.length ? "Data / history" : "No recent warnings"; }
