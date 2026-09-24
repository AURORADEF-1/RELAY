import {expect,it} from 'vitest';
import {reportingWindow,REPORTING_LAUNCH} from '@/lib/fleet-operations/window';
it('starts at UK midnight on launch day and never includes pre-launch days',()=>{for(const days of [1,7,30]){const r=reportingWindow(Date.parse('2026-09-24T18:00:00Z'),days);expect(r.from).toBe(REPORTING_LAUNCH);expect(new Date(r.cycleEndsAt).toISOString()).toBe('2026-09-24T23:00:00.000Z');}});
it('resets at the next UK midnight rather than using a rolling day',()=>{const r=reportingWindow(Date.parse('2026-09-24T23:05:00Z'),1);expect(new Date(r.from).toISOString()).toBe('2026-09-24T23:00:00.000Z');});
it('keeps local midnight boundaries through the winter clock change',()=>{const r=reportingWindow(Date.parse('2026-10-25T12:00:00Z'),1);expect(new Date(r.from).toISOString()).toBe('2026-10-24T23:00:00.000Z');expect(new Date(r.cycleEndsAt).toISOString()).toBe('2026-10-26T00:00:00.000Z');});
it('uses calendar days for longer reports',()=>{const r=reportingWindow(Date.parse('2026-11-01T12:00:00Z'),7);expect(new Date(r.from).toISOString()).toBe('2026-10-26T00:00:00.000Z');});
