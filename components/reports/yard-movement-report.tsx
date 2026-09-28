'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { buildYardReport, loadYardEvents, yardReportCsv, yardDayStart, type YardEvent, type YardPeriod } from '@/lib/yard-report';
import type { ReportRange } from '@/lib/report-analytics';

const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London' });
const duration = (hours: number | null) => hours === null ? 'Not enough history' : hours < 24 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`;

export function YardMovementReport({ range, refreshVersion }: { range: ReportRange; refreshVersion: number }) {
  const [period, setPeriod] = useState<YardPeriod>('week');
  const [state, setState] = useState<{ events: YardEvent[]; loadedAt: string; error: string; loading: boolean; key: string }>({ events: [], loadedAt: '', error: '', loading: true, key: '' });
  const from = yardDayStart(range.start), requestedTo = yardDayStart(range.end);
  const requestKey = `${requestedTo}:${refreshVersion}`;
  useEffect(() => {
    const controller = new AbortController();
    const loadedAt = new Date().toISOString();
    const to = Math.min(requestedTo, Date.parse(loadedAt));
    const db = getSupabaseClient();
    const loading = db ? loadYardEvents(db, to, controller.signal) : Promise.reject(new Error('Reporting connection is unavailable.'));
    loading.then(events => {
      if (!controller.signal.aborted) setState({ events, loadedAt, loading: false, error: '', key: requestKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ events: [], loadedAt, loading: false, error: error instanceof Error ? error.message : 'Unable to load yard report.', key: requestKey });
    });
    return () => controller.abort();
  }, [requestedTo, requestKey]);
  const to = Math.min(requestedTo, Date.parse(state.loadedAt) || requestedTo);
  const report = useMemo(() => buildYardReport(state.events, from, to, period), [state.events, from, to, period]);
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, Math.max(0, Math.ceil(report.movements.length / 50) - 1));
  const movements = [...report.movements].reverse().slice(safePage * 50, safePage * 50 + 50);
  function download() {
    const url = URL.createObjectURL(new Blob([yardReportCsv(report, range.label, period, state.loadedAt)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `relay-yard-${period}-${range.start.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  if (state.loading || state.key !== requestKey) return <p role="status">Generating yard movement report…</p>;
  if (state.error) return <p className="reports-error" role="alert">{state.error} Use Refresh to try again.</p>;
  return <>
    <article className="report-panel">
      <header className="report-heading"><p className="reports-kicker">Yard activity</p><h2>Deployments, returns &amp; turnaround</h2><p>{range.label} · Garboldisham yard · UK time</p></header>
      <div className="reports-filter-bar">
        <label><span>Group totals by</span><select value={period} onChange={e => setPeriod(e.target.value as YardPeriod)}><option value="week">Week (Monday–Sunday)</option><option value="month">Month</option></select></label>
        <button className="console-command-action" onClick={download}>Download report (CSV)</button>
      </div>
      <p>Based on GPS-confirmed yard crossings, not confirmed hire contracts. Assets without recorded crossings are not counted. Operator filters do not apply.</p>
      <p role="note"><strong>History coverage: </strong>{report.firstObserved ? `Earliest stored movement: ${date(report.firstObserved)}. ` : 'No stored movements before the report end. '}
        Earlier periods are incomplete; tracker gaps can also miss movements. Current periods run up to {date(state.loadedAt)}. Zero means no recorded crossings, not proof of no activity.</p>
      <div className="reports-metric-strip">
        <Metric label="Deployments from yard" value={String(report.departures)} detail={`${report.deployedAssets} distinct assets`} />
        <Metric label="Returns to yard" value={String(report.returns)} detail={`${report.returnedAssets} distinct assets`} />
        <Metric label="Average yard turnaround" value={duration(report.averageYardHours)} detail={`${report.matchedTurnarounds} matched return → departure cycles`} />
        <Metric label="Returned assets redeployed" value={report.redeploymentPercent === null ? 'Not enough history' : `${report.redeploymentPercent.toFixed(1)}%`} detail={`${report.redeployedAssets} of ${report.returnedAssets} returned assets`} />
      </div>
      <p>Turnaround is time from a recorded return to the next departure, attributed to the departure period. Redeployment rate is the share of distinct assets returned during this period that subsequently left again before its end. Recent returns have had less time to redeploy.</p>
      <p>Average time away: <strong>{duration(report.averageAwayHours)}</strong> (matched departure → return cycles, attributed to the return period).</p>
      <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>{period === 'week' ? 'Week starting Monday' : 'Month'}</th><th>Departures</th><th>Returns</th><th>Average yard turnaround</th></tr></thead><tbody>
        {report.buckets.map(b => <tr key={b.period}><td>{b.period}</td><td>{b.departures}</td><td>{b.returns}</td><td>{duration(b.averageYardHours)}</td></tr>)}
        {!report.buckets.length && <tr><td colSpan={4}>No elapsed reporting period.</td></tr>}
      </tbody></table></div>
    </article>
    <article className="report-panel"><h2>Asset movement detail</h2><p>Each confirmed departure or return is shown once. Repeated same-direction reports are combined until an opposite crossing is recorded. All rows are included in the download.</p>
      <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Asset</th><th>Movement</th><th>Recorded at (UK)</th><th>Provider</th><th>Yard turnaround</th><th>Time away</th></tr></thead><tbody>
        {movements.map(e => <tr key={e.id}><td>{e.machine?.machine_number ?? e.machine_id}<br />{[e.machine?.make, e.machine?.model].filter(Boolean).join(' ')}</td><td>{e.kind === 'yard_departure' ? 'Deployed from yard' : 'Returned to yard'}</td><td>{date(e.occurred_at)}</td><td>{e.provider}</td><td>{e.kind === 'yard_departure' ? duration(e.yardHours) : '—'}</td><td>{e.kind === 'yard_arrival' ? duration(e.awayHours) : '—'}</td></tr>)}
        {!movements.length && <tr><td colSpan={6}>No recorded yard movements in this period. Check the history coverage above.</td></tr>}
      </tbody></table></div>
      {report.movements.length > 50 && <div className="reports-filter-bar"><button className="console-command-action" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><span>Page {safePage + 1} of {Math.ceil(report.movements.length / 50)}</span><button className="console-command-action" disabled={(safePage + 1) * 50 >= report.movements.length} onClick={() => setPage(safePage + 1)}>Next</button></div>}
    </article>
  </>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="report-metric" data-tone="blue"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
