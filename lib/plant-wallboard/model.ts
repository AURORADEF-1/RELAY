import { DAY } from '@/lib/fleet-operations/report';
import { lastKnown, lastKnownSide, positionOrder, usableCoordinates, type BoardMachine } from './positions';
import { buildYardReport, londonDate, yardBucket, type YardEvent } from '@/lib/yard-report';

export type PlantPosition = { id: string; label: string; model: string; status: 'out' | 'yard' | 'unknown'; reportedAt: string | null; lastKnownOnly: boolean };
export function plantPositions(machines: BoardMachine[], allowed: Set<string>, now: number): PlantPosition[] {
  const byId = new Map<string, BoardMachine[]>();
  for (const m of machines) {
    if (!m.relay || !allowed.has(m.relay.id)) continue;
    byId.set(m.relay.id, [...(byId.get(m.relay.id) ?? []), m]);
  }
  return [...byId].flatMap(([id, candidates]) => {
    // Never include staff, road vehicles or ambiguous/unclassified-only groups.
    if (candidates.some(m => m.assetCategory && !['Plant','Unclassified'].includes(m.assetCategory)) || !candidates.some(m => m.assetCategory === 'Plant')) return [];
    const plant = candidates.filter(m => m.assetCategory === 'Plant').map(m=>lastKnown(m,now));
    const located = plant.filter(m => usableCoordinates(m.position, now)).sort((a,b) => positionOrder(b)-positionOrder(a));
    const latest = located[0] ?? plant[0];
    const side = lastKnownSide(latest, now);
    const conflict = located.some(m => positionOrder(m) === positionOrder(latest) && lastKnownSide(m, now) !== side);
    return [{ id, label: latest.relay!.machine_number, model: latest.relay!.model ?? latest.model,
      status: conflict || side === 'unknown' ? 'unknown' as const : side === 'on_hire' ? 'out' as const : 'yard' as const,
      reportedAt: latest.position?.at ?? null, lastKnownOnly: !!latest.position && (!latest.position.at || now-Date.parse(latest.position.at)>DAY) }];
  });
}
export function ukMidnight(day: string) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  const offsetHours = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(utc));
  return utc - offsetHours * 3600000;
}
export function plantPeriodStarts(now: number) {
  return { today: ukMidnight(londonDate(now)), week: ukMidnight(yardBucket(now, 'week')), month: ukMidnight(`${yardBucket(now, 'month')}-01`) };
}
function summary(report: ReturnType<typeof buildYardReport>) {
  return { departures: report.departures, returns: report.returns, turnaroundHours: report.averageYardHours,
    matchedCycles: report.matchedTurnarounds, redeploymentPercent: report.redeploymentPercent,
    returnedAssets: report.returnedAssets, redeployedAssets: report.redeployedAssets };
}
export function plantBoardData(machines: BoardMachine[], allowed: Set<string>, events: YardEvent[], now: number) {
  const positions = plantPositions(machines, allowed, now), ids = new Set(positions.map(m => m.id));
  const history = events.filter(e => ids.has(e.machine_id));
  const starts = plantPeriodStarts(now);
  const today = buildYardReport(history, starts.today, now, 'week');
  const week = buildYardReport(history, starts.week, now, 'week');
  const month = buildYardReport(history, starts.month, now, 'month');
  const earliest = history.map(e => e.occurred_at).filter(t => Number.isFinite(Date.parse(t)) && Date.parse(t) < now).sort((a,b)=>Date.parse(a)-Date.parse(b))[0] ?? null;
  return { checkedAt: new Date(now).toISOString(), starts, historySince: earliest,
    tracked: positions.length, out: positions.filter(m=>m.status==='out').length,
    lastKnownOnly: positions.filter(m=>m.status!=='unknown'&&m.lastKnownOnly).length,
    yard: positions.filter(m=>m.status==='yard').length, unknown: positions.filter(m=>m.status==='unknown').length,
    today: summary(today), week: summary(week), month: summary(month),
    recent: [...month.movements].reverse().slice(0,36).map(e=>({ id:e.id, label:e.machine?.machine_number ?? positions.find(p=>p.id===e.machine_id)?.label ?? e.machine_id,
      kind:e.kind, at:e.occurred_at, model:[e.machine?.make,e.machine?.model].filter(Boolean).join(' ') })),
  };
}
export type PlantBoardData = ReturnType<typeof plantBoardData> & { warning: string | null };
export const SLIDE_MS = 25000;
export function boardSlide(startedAt: number, now: number, count = 3) { return Math.floor(Math.max(0, now-startedAt)/SLIDE_MS) % count; }
