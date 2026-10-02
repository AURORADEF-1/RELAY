import type { YardEvent } from '@/lib/yard-report';
import type { BoardMachine } from './positions';

export type YardTimeline = {
  provider: string; pin: string; first_at: string; last_at: string; readings: number;
  changes: { at: string; side: 1 | -1 }[];
};
/** Choose one complete tracker stream per asset, never interleave competing providers. */
export function reconcilePlantHistory(machines: BoardMachine[], timelines: YardTimeline[], now: number) {
  const byKey = new Map(timelines.map(t => [`${t.provider}:${t.pin}`, t]));
  const byMachine = new Map<string, { machine: BoardMachine; timeline: YardTimeline }[]>();
  for (const machine of machines) {
    const timeline = byKey.get(`${machine.source ?? 'jcb'}:${machine.pin}`);
    if (!machine.relay || !timeline?.changes.length) continue;
    const rows = byMachine.get(machine.relay.id) ?? [];
    rows.push({ machine, timeline }); byMachine.set(machine.relay.id, rows);
  }
  const events: YardEvent[] = [];
  for (const [id, candidates] of byMachine) {
    // Prefer a stream that is still reporting, then the one with most GPS coverage.
    const fresh = candidates.filter(c => now-Date.parse(c.timeline.last_at)<=86400000);
    const chosen = [...(fresh.length ? fresh : candidates)].sort((a,b) => b.timeline.readings-a.timeline.readings || a.timeline.provider.localeCompare(b.timeline.provider))[0];
    const { machine, timeline } = chosen;
    // First observation establishes a baseline; it is not an arrival/departure.
    for (const change of timeline.changes.slice(1)) {
      events.push({ id:`gps:${timeline.provider}:${timeline.pin}:${change.at}`,machine_id:id,provider:timeline.provider,
        kind:change.side===1?'yard_arrival':'yard_departure',occurred_at:change.at,
        machine:{machine_number:machine.relay!.machine_number,make:machine.relay!.make,model:machine.relay!.model} });
    }
  }
  const located = machines.map(machine => {
    const timeline = byKey.get(`${machine.source ?? 'jcb'}:${machine.pin}`);
    const change = timeline?.changes.at(-1);
    return change ? {...machine,confirmedYardSide:change.side===1?'off_hire' as const:'on_hire' as const,confirmedYardAt:change.at} : machine;
  });
  const historySince = timelines.map(t=>t.first_at).sort()[0] ?? null;
  return { machines:located,events,historySince };
}
