import { describe, expect, it } from 'vitest';
import { buildYardReport, yardBucket, yardReportCsv, loadYardEvents, yardDayStart, type YardEvent } from '@/lib/yard-report';
const event = (id: string, kind: YardEvent['kind'], at: string, machine = 'a'): YardEvent => ({ id, machine_id: machine, provider: 'jcb', kind, occurred_at: at, machine: { machine_number: machine, make: null, model: null } });
const start = Date.parse('2026-09-01T00:00:00Z'), end = Date.parse('2026-10-01T00:00:00Z');
describe('yard movement reporting', () => {
  it('pairs pre-period arrivals with departures and counts returned assets redeployed within the period', () => {
    const r = buildYardReport([
      event('1', 'yard_arrival', '2026-08-31T12:00:00Z'),
      event('2', 'yard_departure', '2026-09-01T12:00:00Z'),
      event('3', 'yard_arrival', '2026-09-03T12:00:00Z'),
      event('4', 'yard_departure', '2026-09-04T12:00:00Z'),
      event('5', 'yard_arrival', '2026-09-05T12:00:00Z', 'b'),
    ], start, end, 'week');
    expect(r.departures).toBe(2); expect(r.returns).toBe(2);
    expect(r.averageYardHours).toBe(24); expect(r.averageAwayHours).toBe(48);
    expect(r.redeploymentPercent).toBe(50); expect(r.deployedAssets).toBe(1);
    expect(r.buckets.reduce((n,b) => n+b.departures,0)).toBe(r.departures);
  });
  it('deduplicates records and repeated same-direction observations across providers without resetting turnaround', () => {
    const first = event('1', 'yard_arrival', '2026-09-01T00:00:00Z');
    const r = buildYardReport([first, first, { ...event('2', 'yard_arrival', '2026-09-01T06:00:00Z'), provider: 'assetcare' }, event('3', 'yard_departure', '2026-09-02T00:00:00Z')], start, end, 'month');
    expect(r.returns).toBe(1); expect(r.averageYardHours).toBe(24); expect(r.movements).toHaveLength(2);
  });
  it('never invents durations from unmatched crossings, excludes end boundary and bad timestamps', () => {
    const r = buildYardReport([event('1','yard_departure','2026-09-01T00:00:00Z'),event('2','yard_arrival','2026-10-01T00:00:00Z'),event('3','yard_arrival','invalid')], start, end, 'month');
    expect(r.departures).toBe(1); expect(r.returns).toBe(0); expect(r.averageYardHours).toBeNull(); expect(r.redeploymentPercent).toBeNull();
  });
  it('does not count a future redeployment in the return cohort', () => {
    const r = buildYardReport([event('1','yard_arrival','2026-09-30T00:00:00Z'),event('2','yard_departure','2026-10-02T00:00:00Z')],start,end,'month');
    expect(r.redeploymentPercent).toBe(0);
  });
  it('uses Monday weeks in UK time across month, year and DST boundaries', () => {
    expect(yardBucket('2026-09-27T23:30:00Z','week')).toBe('2026-09-28');
    expect(yardBucket('2026-10-25T01:30:00Z','week')).toBe('2026-10-19');
    expect(yardBucket('2027-01-01T12:00:00Z','week')).toBe('2026-12-28');
    expect(yardBucket('2026-08-31T23:30:00Z','month')).toBe('2026-09');
  });
  it('shows zero recorded counts for empty periods and null unknown averages', () => {
    const r = buildYardReport([], Date.parse('2026-08-31T23:00:00Z'), Date.parse('2026-09-30T23:00:00Z'), 'month');
    expect(r.buckets).toHaveLength(1); expect(r.buckets[0].returns).toBe(0); expect(r.averageYardHours).toBeNull(); expect(r.firstObserved).toBeNull();
  });
  it('converts selected UK dates at both DST transitions', () => {
    expect(new Date(yardDayStart(new Date(2026, 2, 29))).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(new Date(yardDayStart(new Date(2026, 2, 30))).toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect(new Date(yardDayStart(new Date(2026, 9, 25))).toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(new Date(yardDayStart(new Date(2026, 9, 26))).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
  it('exports coverage, metrics and every detail row with spreadsheet formula protection', () => {
    const r = buildYardReport([event('1','yard_departure','2026-09-01T12:00:00Z','=1+1')],start,end,'month');
    const csv = yardReportCsv(r,'September','month','2026-10-01T00:00:00Z');
    expect(csv).toContain('Earliest stored movement'); expect(csv).toContain("'=1+1"); expect(csv).toContain('not confirmed hire contracts'); expect(csv).toContain('Departure');
  });
});
describe('yard event loading', () => {
  function database(pages: { data: YardEvent[]; error: null | { message: string } }[]) {
    let calls = 0;
    const query = { select() { return this; }, in() { return this; }, lte() { return this; }, lt() { return this; }, order() { return this; }, range() { return this; }, abortSignal() { return this; }, then(resolve: (v: typeof pages[number]) => void) { resolve(pages[Math.min(calls++, pages.length-1)]); } };
    return { db: { from: () => query } as unknown as Parameters<typeof loadYardEvents>[0], calls: () => calls };
  }
  it('reads beyond the first page and stops at a short page', async () => {
    const db = database([{ data: Array(500).fill(event('1','yard_arrival','2026-09-01T00:00:00Z')), error: null }, { data: [event('2','yard_departure','2026-09-02T00:00:00Z')], error: null }]);
    expect(await loadYardEvents(db.db,end)).toHaveLength(501); expect(db.calls()).toBe(2);
  });
  it('fails explicitly instead of exporting a partial report on query errors or guardrail limits', async () => {
    const error = database([{ data: [], error: { message: 'denied' } }]);
    await expect(loadYardEvents(error.db,end)).rejects.toThrow('Unable to load');
    const full = database([{ data: Array(500).fill(event('1','yard_arrival','2026-09-01T00:00:00Z')), error: null }]);
    await expect(loadYardEvents(full.db,end)).rejects.toThrow('complete report cannot'); expect(full.calls()).toBe(40);
  });
});
