import type { SupabaseClient } from '@supabase/supabase-js';
import { csvCell } from '@/lib/fleet-operations/report';

export type YardEvent = {
  id: string; machine_id: string; provider: string;
  kind: 'yard_arrival' | 'yard_departure'; occurred_at: string;
  machine: { machine_number: string; make: string | null; model: string | null } | null;
};
export type YardMovement = YardEvent & { yardHours: number | null; awayHours: number | null };
export type YardPeriod = 'week' | 'month';
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export function londonDate(value: string | number) { return dateFormat.format(new Date(value)); }
/** Interpret the date picker calendar day as UK midnight, regardless of browser zone. */
export function yardDayStart(value: Date) {
  const utc = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(utc));
  return utc - hour * 3600000;
}
export function yardBucket(value: string | number, period: YardPeriod) {
  const day = londonDate(value);
  if (period === 'month') return day.slice(0, 7);
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

export function buildYardReport(events: YardEvent[], from: number, to: number, period: YardPeriod) {
  const sorted = [...new Map(events.map(e => [e.id, e])).values()]
    .filter(e => Number.isFinite(Date.parse(e.occurred_at)) && Date.parse(e.occurred_at) < to)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id.localeCompare(b.id));
  const previous = new Map<string, YardEvent>();
  const movements: YardMovement[] = [];
  const returned = new Set<string>();
  const redeployed = new Set<string>();
  let ignored = 0;
  for (const event of sorted) {
    const last = previous.get(event.machine_id);
    // Multiple providers/cached reports must not create a second deployment or
    // reset an arrival time before the opposite movement has been observed.
    if (last?.kind === event.kind) { ignored++; continue; }
    if (last && last.occurred_at === event.occurred_at) { ignored++; continue; }
    const elapsed = last ? (Date.parse(event.occurred_at) - Date.parse(last.occurred_at)) / 3600000 : null;
    const inRange = Date.parse(event.occurred_at) >= from;
    if (inRange) {
      movements.push({ ...event, yardHours: event.kind === 'yard_departure' ? elapsed : null, awayHours: event.kind === 'yard_arrival' ? elapsed : null });
      if (event.kind === 'yard_arrival') returned.add(event.machine_id);
      else if (returned.has(event.machine_id)) redeployed.add(event.machine_id);
    }
    previous.set(event.machine_id, event);
  }
  const buckets = new Map<string, { period: string; departures: number; returns: number; durations: number[] }>();
  // Calendar labels are in UK time, including weeks crossing a DST change.
  if (from < to) {
    const cursor = new Date(`${londonDate(from)}T12:00:00Z`);
    const lastDay = londonDate(to - 1);
    for (let i = 0; i < 3660 && cursor.toISOString().slice(0, 10) <= lastDay; i++) {
      const key = yardBucket(cursor.getTime(), period);
      if (!buckets.has(key)) buckets.set(key, { period: key, departures: 0, returns: 0, durations: [] });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  for (const row of movements) {
    const key = yardBucket(row.occurred_at, period);
    const bucket = buckets.get(key) ?? { period: key, departures: 0, returns: 0, durations: [] };
    if (row.kind === 'yard_departure') bucket.departures++; else bucket.returns++;
    if (row.yardHours !== null) bucket.durations.push(row.yardHours);
    buckets.set(key, bucket);
  }
  const departures = movements.filter(e => e.kind === 'yard_departure');
  const arrivals = movements.filter(e => e.kind === 'yard_arrival');
  const turnarounds = departures.flatMap(e => e.yardHours === null ? [] : [e.yardHours]);
  return {
    movements, departures: departures.length, returns: arrivals.length,
    deployedAssets: new Set(departures.map(e => e.machine_id)).size,
    returnedAssets: returned.size, redeployedAssets: redeployed.size,
    redeploymentPercent: returned.size ? redeployed.size / returned.size * 100 : null,
    averageYardHours: average(turnarounds), matchedTurnarounds: turnarounds.length,
    averageAwayHours: average(arrivals.flatMap(e => e.awayHours === null ? [] : [e.awayHours])),
    firstObserved: sorted[0]?.occurred_at ?? null, ignored,
    buckets: [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)).map(b => ({ ...b, averageYardHours: average(b.durations) })),
  };
}

export async function loadYardEvents(db: SupabaseClient, to: number, signal?: AbortSignal) {
  const cutoff = new Date().toISOString();
  const events: YardEvent[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    let query = db.from('asset_events')
      .select('id,machine_id,provider,kind,occurred_at,machine:machines(machine_number,make,model)')
      .in('kind', ['yard_arrival', 'yard_departure'])
      .lte('created_at', cutoff).lt('occurred_at', new Date(to).toISOString())
      .order('occurred_at').order('id').range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw new Error('Unable to load yard movement history. Please retry.');
    events.push(...result.data as unknown as YardEvent[]);
    if (result.data.length < 500) return events;
  }
  throw new Error('Yard history exceeds the reporting limit. A complete report cannot be generated; contact an administrator.');
}

export function yardReportCsv(report: ReturnType<typeof buildYardReport>, label: string, period: YardPeriod, generatedAt: string) {
  const rows: unknown[][] = [
    ['RELAY yard movements', label], ['Generated at', generatedAt], ['Time zone', 'Europe/London'],
    ['Basis', 'GPS-confirmed yard crossings; not confirmed hire contracts. Missing movements may affect totals and durations.'],
    ['Earliest stored movement', report.firstObserved ?? 'No history'],
    ['Departures', report.departures], ['Returns', report.returns],
    ['Unique assets deployed', report.deployedAssets], ['Unique assets returned', report.returnedAssets],
    ['Returned assets redeployed by period end', report.redeployedAssets], ['Redeployment rate (%)', report.redeploymentPercent],
    ['Average return-to-next-departure (hours)', report.averageYardHours], ['Matched turnarounds', report.matchedTurnarounds],
    ['Average departure-to-return (hours)', report.averageAwayHours], [],
    [period === 'week' ? 'Week starting Monday' : 'Month', 'Departures', 'Returns', 'Average yard turnaround (hours)'],
    ...report.buckets.map(b => [b.period, b.departures, b.returns, b.averageYardHours]), [],
    ['Asset', 'Make', 'Model', 'Movement', 'Recorded at (UTC)', 'Provider', 'Yard turnaround (hours)', 'Time away (hours)'],
    ...report.movements.map(e => [e.machine?.machine_number ?? e.machine_id, e.machine?.make, e.machine?.model, e.kind === 'yard_departure' ? 'Departure' : 'Return', e.occurred_at, e.provider, e.yardHours, e.awayHours]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
