"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import {
  ReportBarChart,
  ReportDonutChart,
} from "@/components/reports/report-charts";
import {
  fetchAdminOperatorRecords,
  getDefaultAdminOperatorOptions,
} from "@/lib/admin-operators";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  buildReportAnalytics,
  loadReportTicketParts,
  type ClosedJobReportRow,
  type ReportRange,
  type ReportTicketPart,
  type ReportTicketPartCoverage,
} from "@/lib/report-analytics";
import {
  loadRelayAnalyticsSnapshot,
  type RelayAnalyticsSnapshot,
} from "@/lib/relay-console-ai";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type ReportTab = "performance" | "fleet" | "parts" | "suppliers" | "requesters";
type DatePreset = "THIS_MONTH" | "LAST_MONTH" | "LAST_30_DAYS" | "LAST_90_DAYS" | "CUSTOM";

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "performance", label: "Operator efficiency" },
  { id: "fleet", label: "Fleet Health" },
  { id: "parts", label: "Most common parts" },
  { id: "suppliers", label: "Supplier usage & spend" },
  { id: "requesters", label: "Top requesters" },
];

const CHART_COLORS = [
  "#0f6f8f",
  "#e38b2c",
  "#2f855a",
  "#7c5cbf",
  "#c34f62",
  "#486581",
  "#2a9d8f",
  "#bc6c25",
];

const FLEET_COLORS = {
  Healthy: "#2f855a",
  Watch: "#d69e2e",
  "At Risk": "#dd6b20",
  Critical: "#c53030",
} as const;

export default function ReportsPage() {
  const [snapshot, setSnapshot] = useState<RelayAnalyticsSnapshot | null>(null);
  const [operatorNames, setOperatorNames] = useState<string[]>(
    getDefaultAdminOperatorOptions(),
  );
  const [ticketParts, setTicketParts] = useState<ReportTicketPart[]>([]);
  const [ticketPartCoverage, setTicketPartCoverage] =
    useState<ReportTicketPartCoverage | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("performance");
  const [datePreset, setDatePreset] = useState<DatePreset>("THIS_MONTH");
  const [customStart, setCustomStart] = useState(() => monthInputValue(new Date()));
  const [customEnd, setCustomEnd] = useState(() => dateInputValue(new Date()));
  const [selectedOperator, setSelectedOperator] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setErrorMessage("");
      try {
        const access = await getCurrentUserWithRole(supabase, { forceFresh: true });
        if (!access.user || !access.isAdmin) {
          if (isMounted) {
            setAccessDenied(true);
            setIsLoading(false);
            setIsRefreshing(false);
          }
          return;
        }

        const [snapshotResult, operatorsResult, ticketPartsResult] = await Promise.all([
          loadRelayAnalyticsSnapshot(supabase),
          fetchAdminOperatorRecords(supabase).catch(() => null),
          loadReportTicketParts(supabase),
        ]);
        if (!isMounted) return;

        setSnapshot(snapshotResult);
        setTicketParts(ticketPartsResult.rows);
        setTicketPartCoverage(ticketPartsResult.coverage);
        if (operatorsResult) {
          setOperatorNames(operatorsResult.map((operator) => operator.name));
        }
        setAccessDenied(false);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            sanitizeUserFacingError(error, "Unable to load reporting data."),
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadReports();
    return () => {
      isMounted = false;
    };
  }, [refreshVersion]);

  const reportRange = useMemo(
    () => buildDateRange(datePreset, customStart, customEnd),
    [customEnd, customStart, datePreset],
  );
  const analytics = useMemo(
    () => snapshot
      ? buildReportAnalytics(snapshot, reportRange, operatorNames, ticketParts)
      : null,
    [operatorNames, reportRange, snapshot, ticketParts],
  );
  const visibleOperators = useMemo(
    () => analytics?.operators.filter(
      (operator) => selectedOperator === "ALL" || operator.name === selectedOperator,
    ) ?? [],
    [analytics, selectedOperator],
  );
  const visibleClosedJobs = useMemo(
    () => analytics?.closedJobs.filter(
      (job) => selectedOperator === "ALL" || job.operator === selectedOperator,
    ) ?? [],
    [analytics, selectedOperator],
  );

  function refreshReports() {
    setIsRefreshing(true);
    setRefreshVersion((version) => version + 1);
  }

  function exportClosedJobs() {
    const csv = buildClosedJobsCsv(visibleClosedJobs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relay-closed-jobs-${reportRange.start.toISOString().slice(0, 10)}-${new Date(reportRange.end.getTime() - 1).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGuard>
      <ConsoleShell
        eyebrow="RELAY intelligence"
        title="Reports"
        contentClassName="console-content-reports"
        actions={
          <button
            type="button"
            className="console-command-action"
            onClick={refreshReports}
            disabled={isLoading || isRefreshing}
          >
            <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        }
      >
        <header className="reports-page-header">
          <div>
            <p className="reports-kicker">Operational intelligence</p>
            <h1>Reports</h1>
            <p>Measure throughput, purchasing demand, fleet pressure and requester activity using live RELAY records.</p>
          </div>
          <div className="reports-live-state">
            <span />
            {snapshot ? `Synced ${formatTime(snapshot.loadedAt)}` : "Waiting for live data"}
          </div>
        </header>

        {accessDenied ? (
          <section className="reports-state-panel" role="alert">
            <h2>Administrator access required</h2>
            <p>Reports contain operational performance and spend data and are only available to authorised administrators.</p>
            <Link href="/">Return to RELAY</Link>
          </section>
        ) : (
          <>
            <section className="reports-filter-bar" aria-label="Report filters">
              <label>
                <span>Period</span>
                <select value={datePreset} onChange={(event) => setDatePreset(event.target.value as DatePreset)}>
                  <option value="THIS_MONTH">This month</option>
                  <option value="LAST_MONTH">Last month</option>
                  <option value="LAST_30_DAYS">Last 30 days</option>
                  <option value="LAST_90_DAYS">Last 90 days</option>
                  <option value="CUSTOM">Custom range</option>
                </select>
              </label>
              {datePreset === "CUSTOM" ? (
                <>
                  <label>
                    <span>From</span>
                    <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                  </label>
                  <label>
                    <span>To</span>
                    <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                  </label>
                </>
              ) : null}
              <label>
                <span>Operator</span>
                <select value={selectedOperator} onChange={(event) => setSelectedOperator(event.target.value)}>
                  <option value="ALL">All operators</option>
                  {operatorNames.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </label>
              <div className="reports-filter-summary">
                <span>Reporting period</span>
                <strong>{reportRange.label}</strong>
              </div>
            </section>

            {errorMessage ? <div className="reports-error" role="alert">{errorMessage}</div> : null}
            {isLoading ? (
              <section className="reports-state-panel">
                <div className="reports-loading-line" />
                <h2>Building reports</h2>
                <p>Loading bounded ticket, completion, purchase-order and fleet records.</p>
              </section>
            ) : analytics && snapshot ? (
              <>
                <section className="reports-metric-strip" aria-label="Reporting summary">
                  <ReportMetric label="Jobs closed" value={visibleClosedJobs.length} detail={selectedOperator === "ALL" ? reportRange.label : selectedOperator} tone="blue" />
                  <ReportMetric label="POs raised" value={analytics.purchaseOrderCount} detail={formatCurrency(analytics.purchaseOrderValue)} tone="orange" />
                  <ReportMetric label="Average PO" value={formatCurrency(analytics.averagePurchaseOrderValue)} detail="Excludes cancelled POs" tone="green" />
                  <ReportMetric label="Requests raised" value={analytics.totalPeriodTickets} detail={reportRange.label} tone="slate" />
                </section>

                <nav className="reports-tabs" role="tablist" aria-label="Report sections">
                  {REPORT_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`report-panel-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>

                <section
                  id={`report-panel-${activeTab}`}
                  role="tabpanel"
                  className="reports-workspace"
                >
                  {activeTab === "performance" ? (
                    <PerformanceReport
                      operators={visibleOperators}
                      closedJobs={visibleClosedJobs}
                      selectedOperator={selectedOperator}
                      onExport={exportClosedJobs}
                    />
                  ) : null}
                  {activeTab === "fleet" ? <FleetReport analytics={analytics} /> : null}
                  {activeTab === "parts" ? (
                    <RankedReport
                      title="Most common parts requested"
                      description="Linked part numbers and descriptions ranked by quantity requested in the selected period."
                      rows={analytics.commonParts}
                      valueLabel={(value) => `${value} item${value === 1 ? "" : "s"}`}
                    />
                  ) : null}
                  {activeTab === "suppliers" ? <SupplierReport analytics={analytics} /> : null}
                  {activeTab === "requesters" ? (
                    <RankedReport
                      title="Top requesters"
                      description="Requesters ranked by tickets submitted in the selected period."
                      rows={analytics.requesters}
                      valueLabel={(value) => `${value} request${value === 1 ? "" : "s"}`}
                    />
                  ) : null}
                </section>

                <footer className="reports-coverage">
                  <span>Data coverage</span>
                  <strong>
                    {(snapshot.coverage.rowsRead + (ticketPartCoverage?.rowsRead ?? 0)).toLocaleString("en-GB")}
                    {" "}bounded rows across {snapshot.coverage.queryCount + (ticketPartCoverage?.queryCount ?? 0)} queries
                  </strong>
                  {snapshot.coverage.truncated.length > 0
                    ? <em>Newest bounded records shown; limits reached for {snapshot.coverage.truncated.join(", ")}.</em>
                    : ticketPartCoverage?.truncated
                      ? <em>Newest {ticketPartCoverage.rowsRead.toLocaleString("en-GB")} linked parts shown; the parts guardrail was reached.</em>
                      : <em>No reporting guardrail limits were reached.</em>}
                </footer>
              </>
            ) : null}
          </>
        )}
      </ConsoleShell>
    </AuthGuard>
  );
}

function PerformanceReport({
  operators,
  closedJobs,
  selectedOperator,
  onExport,
}: {
  operators: ReturnType<typeof buildReportAnalytics>["operators"];
  closedJobs: ClosedJobReportRow[];
  selectedOperator: string;
  onExport: () => void;
}) {
  return (
    <>
      <div className="reports-primary-grid">
        <article className="report-panel">
          <ReportHeading
            eyebrow="Completion distribution"
            title="Operator efficiency"
            description="Closed-job share and workflow indicators. These measures show throughput, not work quality."
          />
          <ReportDonutChart
            segments={operators.map((operator, index) => ({
              label: operator.name,
              value: operator.completed,
              color: CHART_COLORS[index % CHART_COLORS.length],
            }))}
            centerLabel="jobs closed"
            centerValue={closedJobs.length}
          />
        </article>

        <article className="report-panel">
          <ReportHeading
            eyebrow="Operator comparison"
            title={selectedOperator === "ALL" ? "Team workflow" : selectedOperator}
            description="Completions and new assignments use the selected period. Active, urgent and overdue figures are live."
          />
          <div className="operator-report-list">
            {operators.length > 0 ? operators.map((operator) => (
              <div key={operator.name} className="operator-report-row">
                <div>
                  <strong>{operator.name}</strong>
                  <span>{operator.averageCloseDays === null ? "No close-time sample" : `${operator.averageCloseDays.toFixed(1)} days average close`}</span>
                </div>
                <dl>
                  <div><dt>Closed</dt><dd>{operator.completed}</dd></div>
                  <div><dt>New</dt><dd>{operator.newAssigned}</dd></div>
                  <div><dt>Active</dt><dd>{operator.active}</dd></div>
                  <div><dt>Urgent</dt><dd>{operator.urgent}</dd></div>
                  <div><dt>Overdue</dt><dd>{operator.overdue}</dd></div>
                </dl>
              </div>
            )) : <p className="report-inline-empty">No operator activity is available for this period.</p>}
          </div>
        </article>
      </div>

      <article className="report-panel report-table-panel">
        <div className="report-table-heading">
          <ReportHeading
            eyebrow="Auditable detail"
            title="Jobs closed"
            description={`${closedJobs.length} matching completed job${closedJobs.length === 1 ? "" : "s"}, newest first.`}
          />
          <button type="button" onClick={onExport} disabled={closedJobs.length === 0}>
            <ConsoleIcon name="file" className="h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Operator</th>
                <th>Completed</th>
                <th>Machine</th>
                <th>Requester</th>
                <th>Request</th>
                <th>PO</th>
              </tr>
            </thead>
            <tbody>
              {closedJobs.length > 0 ? closedJobs.map((job) => (
                <tr key={job.id}>
                  <td><Link href={`/tickets/${job.id}`}>{job.jobNumber}</Link></td>
                  <td>{job.operator}</td>
                  <td>{formatDate(job.completedAt)}</td>
                  <td>{job.machineReference}</td>
                  <td>{job.requester}<small>{job.department}</small></td>
                  <td className="reports-table-description">{job.request}</td>
                  <td>{job.purchaseOrderNumber}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="reports-table-empty">No closed jobs match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}

function FleetReport({ analytics }: { analytics: ReturnType<typeof buildReportAnalytics> }) {
  return (
    <div className="reports-primary-grid">
      <article className="report-panel">
        <ReportHeading
          eyebrow="Fleet risk distribution"
          title="Fleet Health"
          description="Health reflects current active, urgent and ordered pressure plus request frequency in the selected period."
        />
        <ReportDonutChart
          segments={analytics.fleetHealth.map((entry) => ({
            label: entry.label,
            value: entry.count,
            color: FLEET_COLORS[entry.label],
          }))}
          centerLabel="machines"
          centerValue={analytics.fleetRows.length}
        />
      </article>
      <article className="report-panel">
        <ReportHeading
          eyebrow="Machines needing attention"
          title="Fleet pressure"
          description="Critical and at-risk machines appear first."
        />
        <div className="fleet-report-list">
          {analytics.fleetRows.slice(0, 12).map((row) => (
            <div key={row.key}>
              <span className="fleet-report-health" data-health={row.health}>{row.health}</span>
              <strong>{row.label}</strong>
              <small>{row.fleetName}</small>
              <dl>
                <div><dt>Requests</dt><dd>{row.requests}</dd></div>
                <div><dt>Active</dt><dd>{row.active}</dd></div>
                <div><dt>Urgent</dt><dd>{row.urgent}</dd></div>
              </dl>
            </div>
          ))}
          {analytics.fleetRows.length === 0 ? <p className="report-inline-empty">No machine-linked activity is available.</p> : null}
        </div>
      </article>
    </div>
  );
}

function SupplierReport({ analytics }: { analytics: ReturnType<typeof buildReportAnalytics> }) {
  return (
    <div className="reports-primary-grid">
      <article className="report-panel">
        <ReportHeading
          eyebrow="Spend concentration"
          title="Supplier spend"
          description="Recorded value from non-cancelled purchase orders raised in the selected period."
        />
        <ReportDonutChart
          segments={analytics.suppliers.slice(0, 7).map((supplier, index) => ({
            label: supplier.label,
            value: supplier.value,
            color: CHART_COLORS[index % CHART_COLORS.length],
          }))}
          centerLabel="total spend"
          centerValue={formatCompactCurrency(analytics.purchaseOrderValue)}
        />
      </article>
      <article className="report-panel">
        <ReportHeading
          eyebrow="Usage and value"
          title="Top suppliers"
          description="Ranked by recorded PO value, with order counts for context."
        />
        <ReportBarChart
          rows={analytics.suppliers.map((supplier) => ({
            key: supplier.key,
            label: supplier.label,
            value: supplier.value,
            detail: `${supplier.count} PO${supplier.count === 1 ? "" : "s"}`,
          }))}
          valueLabel={formatCompactCurrency}
        />
      </article>
    </div>
  );
}

function RankedReport({
  title,
  description,
  rows,
  valueLabel,
}: {
  title: string;
  description: string;
  rows: Array<{ key: string; label: string; count: number }>;
  valueLabel: (value: number) => string;
}) {
  return (
    <article className="report-panel report-panel-wide">
      <ReportHeading eyebrow="Demand ranking" title={title} description={description} />
      <ReportBarChart
        rows={rows.map((row) => ({ key: row.key, label: row.label, value: row.count }))}
        valueLabel={valueLabel}
      />
    </article>
  );
}

function ReportMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "blue" | "orange" | "green" | "slate";
}) {
  return (
    <article className="report-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ReportHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="report-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function buildDateRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
): ReportRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "THIS_MONTH") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }
  if (preset === "LAST_MONTH") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      start,
      end: new Date(now.getFullYear(), now.getMonth(), 1),
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }
  if (preset === "LAST_30_DAYS" || preset === "LAST_90_DAYS") {
    const days = preset === "LAST_30_DAYS" ? 30 : 90;
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return { start, end, label: `Last ${days} days` };
  }
  const start = parseDateInput(customStart) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const inclusiveEnd = parseDateInput(customEnd) ?? today;
  const end = new Date(inclusiveEnd);
  end.setDate(end.getDate() + 1);
  if (end <= start) {
    const safeEnd = new Date(start);
    safeEnd.setDate(safeEnd.getDate() + 1);
    return { start, end: safeEnd, label: formatDateRange(start, start) };
  }
  return { start, end, label: formatDateRange(start, inclusiveEnd) };
}

function buildClosedJobsCsv(rows: ClosedJobReportRow[]) {
  const header = ["Job number", "Operator", "Completed date", "Machine", "Requester", "Department", "Request", "Supplier", "PO number"];
  return [
    header.map(csvCell).join(","),
    ...rows.map((row) => [
      row.jobNumber,
      row.operator,
      row.completedAt,
      row.machineReference,
      row.requester,
      row.department,
      row.request,
      row.supplier,
      row.purchaseOrderNumber,
    ].map(csvCell).join(",")),
  ].join("\n");
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseDateInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthInputValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateRange(start: Date, end: Date) {
  return `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} – ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
