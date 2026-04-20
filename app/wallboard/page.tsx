"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ADMIN_OPERATOR_OPTIONS } from "@/lib/admin-operators";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type WallboardTicket = {
  id: string;
  job_number: string | null;
  machine_reference: string | null;
  requester_name: string | null;
  request_summary: string | null;
  request_details: string | null;
  assigned_to: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  ordered_at?: string | null;
  supplier_name?: string | null;
  order_amount?: number | string | null;
};

type SupplierSpendTicket = {
  id: string;
  supplier_name: string | null;
  order_amount: number | string | null;
  ordered_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  status: string | null;
};

type WallboardMode = "inbound" | "ready" | "operators" | "suppliers";

const ROTATION_MODES: WallboardMode[] = ["inbound", "ready", "operators", "suppliers"];
const MODE_DURATION_MS = 1000 * 45;
const POLL_INTERVAL_MS = 1000 * 30;
const PAGE_DURATION_MS = 1000 * 12;
const PAGE_SIZE = 12;
const REALTIME_REFRESH_DEBOUNCE_MS = 500;
const AUTO_SCROLL_INTERVAL_MS = 80;
const AUTO_SCROLL_STEP_PX = 1;
const AUTO_SCROLL_EDGE_PAUSE_MS = 1800;

export default function WallboardPage() {
  const [tickets, setTickets] = useState<WallboardTicket[]>([]);
  const [supplierSpendTickets, setSupplierSpendTickets] = useState<SupplierSpendTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<WallboardMode>("inbound");
  const [modeStartedAt, setModeStartedAt] = useState(() => Date.now());
  const [currentPage, setCurrentPage] = useState(0);
  const [pageStartedAt, setPageStartedAt] = useState(() => Date.now());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const signatureRef = useRef("");
  const supplierSpendSignatureRef = useRef("");
  const supplierSpendTicketsRef = useRef<SupplierSpendTicket[]>([]);
  const pendingSignatureRef = useRef("");
  const modeStartedAtRef = useRef(modeStartedAt);
  const pageStartedAtRef = useRef(pageStartedAt);
  const currentModeRef = useRef(currentMode);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    modeStartedAtRef.current = modeStartedAt;
  }, [modeStartedAt]);

  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  useEffect(() => {
    supplierSpendTicketsRef.current = supplierSpendTickets;
  }, [supplierSpendTickets]);

  useEffect(() => {
    pageStartedAtRef.current = pageStartedAt;
  }, [pageStartedAt]);

  useEffect(() => {
    let isActive = true;

    async function loadTickets() {
      const supabase = getSupabaseClient();

      if (!supabase || !isActive) {
        return;
      }

      const [queueResult, spendResult] = await Promise.all([
        supabase
          .from("tickets")
          .select(
            "id, job_number, machine_reference, requester_name, request_summary, request_details, assigned_to, status, created_at, updated_at, ordered_at, supplier_name, order_amount",
          )
          .in("status", activeTicketStatuses)
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("tickets")
          .select("id, supplier_name, order_amount, ordered_at, updated_at, created_at, status")
          .not("supplier_name", "is", null)
          .order("ordered_at", { ascending: false, nullsFirst: false })
          .limit(500),
      ]);

      if (!isActive) {
        return;
      }

      if (queueResult.error) {
        setLoadError("Unable to load the live queue.");
        setIsLoading(false);
        return;
      }

      const nextTickets = (queueResult.data ?? []) as WallboardTicket[];
      const nextSupplierSpendTickets = spendResult.error
        ? supplierSpendTicketsRef.current
        : ((spendResult.data ?? []) as SupplierSpendTicket[]);
      const nextSignature = nextTickets
        .map((ticket) =>
          [
            ticket.id,
            ticket.status,
            ticket.updated_at,
            ticket.assigned_to,
            ticket.request_summary,
            ticket.supplier_name,
            ticket.order_amount,
          ].join(":"),
        )
        .join("|");
      const nextPendingSignature = nextTickets
        .filter((ticket) => ticket.status === "PENDING")
        .map((ticket) => [ticket.id, ticket.updated_at, ticket.created_at].join(":"))
        .join("|");
      const nextSupplierSpendSignature = nextSupplierSpendTickets
        .map((ticket) =>
          [
            ticket.id,
            ticket.supplier_name,
            ticket.order_amount,
            ticket.ordered_at,
            ticket.updated_at,
          ].join(":"),
        )
        .join("|");
      if (
        pendingSignatureRef.current &&
        nextPendingSignature !== pendingSignatureRef.current &&
        currentModeRef.current !== "inbound"
      ) {
        const now = Date.now();
        setCurrentMode("inbound");
        setModeStartedAt(now);
        setCurrentPage(0);
        setPageStartedAt(now);
      }

      pendingSignatureRef.current = nextPendingSignature;

      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        setTickets(nextTickets);
      }

      if (nextSupplierSpendSignature !== supplierSpendSignatureRef.current) {
        supplierSpendSignatureRef.current = nextSupplierSpendSignature;
        setSupplierSpendTickets(nextSupplierSpendTickets);
      }

      setLoadError(spendResult.error ? "Supplier spend unavailable. Live queue is current." : null);
      setLastUpdatedAt(new Date().toISOString());
      setIsLoading(false);
    }

    void loadTickets();

    const pollInterval = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      void loadTickets();
    }, POLL_INTERVAL_MS);

    let refreshTimeout: number | null = null;
    const realtimeChannel = getSupabaseClient()?.channel("relay-wallboard-refresh");

    realtimeChannel?.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tickets",
      },
      () => {
        if (refreshTimeout) {
          window.clearTimeout(refreshTimeout);
        }

        refreshTimeout = window.setTimeout(() => {
          refreshTimeout = null;
          void loadTickets();
        }, REALTIME_REFRESH_DEBOUNCE_MS);
      },
    );
    realtimeChannel?.subscribe();

    const countdownInterval = window.setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);

      if (now - modeStartedAtRef.current >= MODE_DURATION_MS) {
        setCurrentMode((previousMode) => getNextWallboardMode(previousMode));
        setModeStartedAt(now);
        setCurrentPage(0);
        setPageStartedAt(now);
        return;
      }

      if (now - pageStartedAtRef.current >= PAGE_DURATION_MS) {
        setCurrentPage((previousPage) => previousPage + 1);
        setPageStartedAt(now);
      }
    }, 1000);

    function handleVisibilityChange() {
      if (!document.hidden) {
        void loadTickets();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(pollInterval);
      window.clearInterval(countdownInterval);
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      if (realtimeChannel) {
        void getSupabaseClient()?.removeChannel(realtimeChannel);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const inboundTickets = useMemo(() => {
    return [...tickets]
      .filter(
        (ticket) => ticket.status === "PENDING" || ticket.status === "IN_PROGRESS",
      )
      .sort((left, right) => {
        const leftPriority = getInboundPriority(left.status);
        const rightPriority = getInboundPriority(right.status);

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return compareIsoDates(left.created_at, right.created_at);
      });
  }, [tickets]);

  const readyTickets = useMemo(() => {
    return [...tickets]
      .filter((ticket) => ticket.status === "READY")
      .sort((left, right) => compareIsoDates(left.updated_at, right.updated_at));
  }, [tickets]);

  const operatorMetrics = useMemo(() => {
    return ADMIN_OPERATOR_OPTIONS.map((operator) => {
      const operatorTickets = tickets.filter(
        (ticket) => normalizeOperatorName(ticket.assigned_to) === normalizeOperatorName(operator),
      );
      const pendingCount = operatorTickets.filter((ticket) => ticket.status === "PENDING").length;
      const inProgressCount = operatorTickets.filter((ticket) => ticket.status === "IN_PROGRESS").length;
      const orderedCount = operatorTickets.filter((ticket) => ticket.status === "ORDERED").length;
      const readyCount = operatorTickets.filter((ticket) => ticket.status === "READY").length;
      const oldestTicket = [...operatorTickets].sort((left, right) =>
        compareIsoDates(left.created_at, right.created_at),
      )[0];

      return {
        operator,
        total: operatorTickets.length,
        pendingCount,
        inProgressCount,
        orderedCount,
        readyCount,
        oldestAge: formatRelativeAge(oldestTicket?.created_at ?? null),
      };
    });
  }, [tickets]);

  const supplierSpendSummary = useMemo(() => {
    const currentMonthKey = getMonthKey(new Date());
    const supplierMap = new Map<
      string,
      { supplierName: string; orderCount: number; totalSpend: number; lastOrderedAt: string | null }
    >();

    supplierSpendTickets.forEach((ticket) => {
      const supplierName = ticket.supplier_name?.trim();
      const orderedAt = ticket.ordered_at ?? ticket.updated_at ?? ticket.created_at;

      if (!supplierName || !orderedAt || getMonthKey(new Date(orderedAt)) !== currentMonthKey) {
        return;
      }

      const normalizedSupplierName = supplierName.toLowerCase();
      const existing = supplierMap.get(normalizedSupplierName);
      const orderAmount = parseOrderAmount(ticket.order_amount);

      supplierMap.set(normalizedSupplierName, {
        supplierName: existing?.supplierName ?? supplierName,
        orderCount: (existing?.orderCount ?? 0) + 1,
        totalSpend: Number(((existing?.totalSpend ?? 0) + orderAmount).toFixed(2)),
        lastOrderedAt: latestIsoDate(existing?.lastOrderedAt ?? null, orderedAt),
      });
    });

    const suppliers = Array.from(supplierMap.values()).sort((left, right) => {
      if (right.totalSpend !== left.totalSpend) {
        return right.totalSpend - left.totalSpend;
      }

      return right.orderCount - left.orderCount;
    });

    return {
      monthLabel: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date()),
      suppliers,
      totalSpend: Number(suppliers.reduce((sum, supplier) => sum + supplier.totalSpend, 0).toFixed(2)),
      orderCount: suppliers.reduce((sum, supplier) => sum + supplier.orderCount, 0),
    };
  }, [supplierSpendTickets]);

  const activeQueueTickets = currentMode === "inbound" ? inboundTickets : readyTickets;
  const pageCount = Math.max(1, Math.ceil(activeQueueTickets.length / PAGE_SIZE));
  const safePageIndex = activeQueueTickets.length === 0 ? 0 : currentPage % pageCount;
  const visibleTickets = activeQueueTickets.slice(
    safePageIndex * PAGE_SIZE,
    safePageIndex * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    const viewport = scrollViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: 0 });
    let direction: 1 | -1 = 1;
    let pauseUntil = Date.now() + AUTO_SCROLL_EDGE_PAUSE_MS;

    const intervalId = window.setInterval(() => {
      const currentViewport = scrollViewportRef.current;

      if (!currentViewport) {
        return;
      }

      const maxScrollTop = currentViewport.scrollHeight - currentViewport.clientHeight;

      if (maxScrollTop <= 4) {
        currentViewport.scrollTo({ top: 0 });
        return;
      }

      const now = Date.now();

      if (now < pauseUntil) {
        return;
      }

      const nextTop = currentViewport.scrollTop + direction * AUTO_SCROLL_STEP_PX;

      if (nextTop >= maxScrollTop) {
        currentViewport.scrollTop = maxScrollTop;
        direction = -1;
        pauseUntil = now + AUTO_SCROLL_EDGE_PAUSE_MS;
        return;
      }

      if (nextTop <= 0) {
        currentViewport.scrollTop = 0;
        direction = 1;
        pauseUntil = now + AUTO_SCROLL_EDGE_PAUSE_MS;
        return;
      }

      currentViewport.scrollTop = nextTop;
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [currentMode, safePageIndex]);

  const secondsRemaining = Math.max(
    0,
    Math.ceil((MODE_DURATION_MS - (countdownNow - modeStartedAt)) / 1000),
  );
  const pageSecondsRemaining = Math.max(
    0,
    Math.ceil((PAGE_DURATION_MS - (countdownNow - pageStartedAt)) / 1000),
  );
  const nextModeLabel = getWallboardModeLabel(getNextWallboardMode(currentMode));

  return (
    <AuthGuard requiredRole="admin">
      <main className="aurora-shell h-screen overflow-hidden px-8 py-8 text-white">
        <div className="aurora-shell-inner flex h-full max-w-[120rem] flex-col gap-6 overflow-hidden">
          <header className="rounded-[2rem] border border-white/12 bg-black/24 px-7 py-5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-5">
              <div className="flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/aurora-logo-build.gif"
                  alt="Aurora Systems"
                  className="h-20 w-20 object-contain"
                />
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.38em] text-white/55">
                    Relay Wallboard
                  </p>
                  <h1 className="text-4xl font-semibold tracking-[0.12em] text-white xl:text-5xl">
                    {getWallboardModeLabel(currentMode)}
                  </h1>
                  <p className="text-base text-white/70 xl:text-lg">
                    Live office view for the 40&quot; operations screen
                  </p>
                </div>
              </div>

              <div className="grid min-w-[31rem] grid-cols-4 gap-3">
                <WallboardMetric
                  label="Pending / In Progress"
                  value={inboundTickets.length}
                  accent="red"
                />
                <WallboardMetric
                  label="Ready to Collect"
                  value={readyTickets.length}
                  accent="green"
                />
                <WallboardMetric
                  label="Jobs Active"
                  value={operatorMetrics.reduce((sum, operator) => sum + operator.total, 0)}
                  accent="blue"
                />
                <WallboardMetric
                  label={`Next: ${nextModeLabel}`}
                  value={formatCountdown(secondsRemaining)}
                  accent="neutral"
                />
              </div>
            </div>
          </header>

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {currentMode === "operators" ? (
              <OperatorKpiScreen operatorMetrics={operatorMetrics} tickets={tickets} />
            ) : currentMode === "suppliers" ? (
              <SupplierSpendScreen summary={supplierSpendSummary} />
            ) : (
              <section className="grid min-h-full auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleTickets.length > 0 ? (
                  visibleTickets.map((ticket) => (
                    <article
                      key={`${currentMode}-${ticket.id}`}
                      className={getWallboardCardClass(ticket.status)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/45">
                            Job
                          </p>
                          <p className="mt-2 text-3xl font-semibold tracking-[0.08em] text-white 2xl:text-4xl">
                            {ticket.job_number ?? "Unassigned"}
                          </p>
                        </div>
                        <span className={getStatusBadgeClass(ticket.status)}>
                          {ticket.status ?? "UNKNOWN"}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-3">
                        <WallboardMeta label="Machine" value={ticket.machine_reference ?? "Not set"} />
                        <WallboardMeta
                          label={currentMode === "ready" ? "Prepared By" : "Assigned To"}
                          value={ticket.assigned_to ?? "Awaiting assignment"}
                        />
                        <WallboardMeta
                          label="Requested By"
                          value={ticket.requester_name ?? "Unknown requester"}
                        />
                      </div>

                      <div className="mt-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/45">
                          Request
                        </p>
                        <p className="mt-3 max-h-[6.75rem] overflow-hidden text-xl leading-snug text-white/92 2xl:text-2xl">
                          {ticket.request_summary ?? ticket.request_details ?? "No summary provided"}
                        </p>
                      </div>

                      <div className="mt-auto pt-5 text-sm font-medium uppercase tracking-[0.2em] text-white/52">
                        {currentMode === "ready" ? "Ready since" : "Waiting since"}{" "}
                        {formatRelativeAge(ticket.updated_at ?? ticket.created_at)}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="col-span-full flex min-h-[50vh] items-center justify-center rounded-[2rem] border border-white/10 bg-black/20 px-8 py-12 text-center backdrop-blur-sm">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.38em] text-white/45">
                        {currentMode === "inbound" ? "Inbound Queue" : "Ready Queue"}
                      </p>
                      <p className="text-4xl font-semibold text-white">
                        {isLoading
                          ? "Loading live tickets..."
                          : loadError ?? "No live tickets in this queue right now"}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <footer className="shrink-0 flex items-center justify-between rounded-[2rem] border border-white/10 bg-black/22 px-6 py-4 text-sm text-white/60 backdrop-blur-sm">
            <p>
              Refreshes every {Math.floor(POLL_INTERVAL_MS / 1000)} seconds. Page flips every{" "}
              {Math.floor(PAGE_DURATION_MS / 1000)} seconds for low-load full-queue coverage.
            </p>
            <p className="text-right">
              <span className="mr-5">Next page {formatCountdown(pageSecondsRemaining)}</span>
              {lastUpdatedAt ? `Last synced ${formatClock(lastUpdatedAt)}` : "Waiting for first sync"}
            </p>
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}

function WallboardMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "red" | "green" | "blue" | "neutral";
}) {
  const accentClass =
    accent === "red"
      ? "border-red-400/30 bg-red-500/14 text-red-100"
      : accent === "green"
        ? "border-emerald-400/28 bg-emerald-500/14 text-emerald-100"
        : accent === "blue"
          ? "border-sky-300/28 bg-sky-500/14 text-sky-100"
          : "border-white/10 bg-white/6 text-white";

  return (
    <div className={`rounded-[1.35rem] border px-4 py-3.5 backdrop-blur-sm ${accentClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">{label}</p>
      <p className="mt-2.5 text-3xl font-semibold tracking-[0.06em]">{value}</p>
    </div>
  );
}

function OperatorKpiScreen({
  operatorMetrics,
  tickets,
}: {
  operatorMetrics: Array<{
    operator: string;
    total: number;
    pendingCount: number;
    inProgressCount: number;
    orderedCount: number;
    readyCount: number;
    oldestAge: string;
  }>;
  tickets: WallboardTicket[];
}) {
  const unassignedCount = tickets.filter((ticket) => !ticket.assigned_to?.trim()).length;
  const activeCount = tickets.length;
  const busiestOperator = [...operatorMetrics].sort((left, right) => right.total - left.total)[0];

  return (
    <section className="grid min-h-[70vh] gap-5 xl:grid-cols-[1fr_0.42fr]">
      <div className="grid gap-5 lg:grid-cols-3">
        {operatorMetrics.map((operator) => (
          <article
            key={operator.operator}
            className="flex min-h-[32rem] flex-col rounded-[2rem] border border-white/12 bg-white/[0.075] p-6 shadow-[0_30px_90px_-56px_rgba(0,0,0,0.9)] backdrop-blur-md"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.34em] text-white/45">
              Admin User
            </p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[0.08em] text-white">
              {operator.operator}
            </h2>
            <p className="mt-6 text-8xl font-semibold tracking-[0.04em] text-white">
              {operator.total}
            </p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.28em] text-white/45">
              Active tickets
            </p>

            <div className="mt-8 grid gap-3">
              <OperatorStat label="Pending" value={operator.pendingCount} tone="red" />
              <OperatorStat label="In Progress" value={operator.inProgressCount} tone="blue" />
              <OperatorStat label="Ordered" value={operator.orderedCount} tone="amber" />
              <OperatorStat label="Ready" value={operator.readyCount} tone="green" />
            </div>

            <div className="mt-auto rounded-[1.35rem] border border-white/10 bg-black/18 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
                Oldest active
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{operator.oldestAge}</p>
            </div>
          </article>
        ))}
      </div>

      <aside className="grid gap-5">
        <GlassSummaryCard label="Active workload" value={activeCount} helper="Live tickets across the admin queue." />
        <GlassSummaryCard label="Unassigned" value={unassignedCount} helper="Jobs still sitting in Stores queue." />
        <GlassSummaryCard
          label="Busiest admin"
          value={busiestOperator?.operator ?? "-"}
          helper={`${busiestOperator?.total ?? 0} active tickets assigned.`}
        />
      </aside>
    </section>
  );
}

function SupplierSpendScreen({
  summary,
}: {
  summary: {
    monthLabel: string;
    suppliers: Array<{
      supplierName: string;
      orderCount: number;
      totalSpend: number;
      lastOrderedAt: string | null;
    }>;
    totalSpend: number;
    orderCount: number;
  };
}) {
  const topSuppliers = summary.suppliers.slice(0, 8);

  return (
    <section className="grid min-h-[70vh] gap-5 xl:grid-cols-[0.38fr_1fr]">
      <aside className="grid gap-5">
        <GlassSummaryCard label="Supplier spend" value={formatCurrency(summary.totalSpend)} helper={summary.monthLabel} />
        <GlassSummaryCard label="Orders captured" value={summary.orderCount} helper="Orders with supplier names this month." />
        <GlassSummaryCard label="Suppliers" value={summary.suppliers.length} helper="Distinct suppliers in this month." />
      </aside>

      <div className="rounded-[2rem] border border-white/12 bg-white/[0.075] p-6 shadow-[0_30px_90px_-56px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.34em] text-white/45">
              Monthly Supplier Spend
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[0.08em] text-white">
              {summary.monthLabel}
            </h2>
          </div>
          <p className="text-right text-sm font-semibold uppercase tracking-[0.24em] text-white/48">
            Top suppliers by spend
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          {topSuppliers.length > 0 ? (
            topSuppliers.map((supplier, index) => (
              <div
                key={supplier.supplierName}
                className="grid grid-cols-[4rem_1fr_auto] items-center gap-4 rounded-[1.35rem] border border-white/10 bg-black/18 px-4 py-4"
              >
                <p className="text-2xl font-semibold text-white/45">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div>
                  <p className="text-2xl font-semibold text-white">{supplier.supplierName}</p>
                  <p className="mt-1 text-sm font-medium uppercase tracking-[0.22em] text-white/42">
                    {supplier.orderCount} order{supplier.orderCount === 1 ? "" : "s"} · Last {formatRelativeAge(supplier.lastOrderedAt)}
                  </p>
                </div>
                <p className="text-3xl font-semibold text-emerald-100">
                  {formatCurrency(supplier.totalSpend)}
                </p>
              </div>
            ))
          ) : (
            <div className="flex min-h-[42vh] items-center justify-center rounded-[1.75rem] border border-white/10 bg-black/18 px-8 text-center">
              <p className="text-3xl font-semibold text-white">
                No supplier spend captured for this month yet
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OperatorStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "blue" | "amber" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-300/25 bg-red-500/12 text-red-100"
      : tone === "blue"
        ? "border-sky-300/25 bg-sky-500/12 text-sky-100"
        : tone === "amber"
          ? "border-amber-300/25 bg-amber-500/12 text-amber-100"
          : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100";

  return (
    <div className={`flex items-center justify-between rounded-[1.1rem] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function GlassSummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <article className="rounded-[2rem] border border-white/12 bg-white/[0.075] p-6 shadow-[0_30px_90px_-56px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/45">{label}</p>
      <p className="mt-4 text-5xl font-semibold tracking-[0.06em] text-white">{value}</p>
      <p className="mt-3 text-base leading-7 text-white/58">{helper}</p>
    </article>
  );
}

function WallboardMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/42">{label}</p>
      <p className="mt-1.5 text-lg text-white/90 2xl:text-xl">{value}</p>
    </div>
  );
}

function getInboundPriority(status: string | null) {
  switch (status) {
    case "PENDING":
      return 0;
    case "QUERY":
      return 1;
    case "QUOTE":
      return 2;
    case "ESTIMATE":
      return 3;
    case "IN_PROGRESS":
      return 4;
    case "ORDERED":
      return 5;
    default:
      return 6;
  }
}

function getNextWallboardMode(mode: WallboardMode) {
  const currentIndex = ROTATION_MODES.indexOf(mode);
  return ROTATION_MODES[(currentIndex + 1) % ROTATION_MODES.length] ?? "inbound";
}

function getWallboardModeLabel(mode: WallboardMode) {
  switch (mode) {
    case "inbound":
      return "Inbound Queue";
    case "ready":
      return "Ready Queue";
    case "operators":
      return "Admin KPIs";
    case "suppliers":
      return "Supplier Spend";
  }
}

function normalizeOperatorName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function compareIsoDates(left: string | null, right: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function latestIsoDate(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

function getMonthKey(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseOrderAmount(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getWallboardCardClass(status: string | null) {
  const baseClass =
    "flex min-h-[20rem] flex-col rounded-[1.8rem] border px-5 py-5 backdrop-blur-sm transition-transform";

  switch (status) {
    case "PENDING":
      return `${baseClass} border-red-400/40 bg-red-500/14 shadow-[0_0_0_1px_rgba(248,113,113,0.16),0_0_36px_rgba(239,68,68,0.18)] animate-[wallboard-alert_1.8s_ease-in-out_infinite]`;
    case "QUERY":
      return `${baseClass} border-orange-300/40 bg-orange-500/12 shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_0_32px_rgba(249,115,22,0.14)] animate-[wallboard-warning_2.2s_ease-in-out_infinite]`;
    case "READY":
      return `${baseClass} border-emerald-300/38 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(52,211,153,0.14),0_0_34px_rgba(16,185,129,0.18)]`;
    default:
      return `${baseClass} border-white/10 bg-black/24 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.75)]`;
  }
}

function getStatusBadgeClass(status: string | null) {
  const baseClass =
    "inline-flex min-h-[2.75rem] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.18em]";

  switch (status) {
    case "PENDING":
      return `${baseClass} border-red-300/35 bg-red-500/18 text-red-100 animate-[wallboard-alert_1.8s_ease-in-out_infinite]`;
    case "QUERY":
      return `${baseClass} border-orange-300/35 bg-orange-500/18 text-orange-100 animate-[wallboard-warning_2.2s_ease-in-out_infinite]`;
    case "READY":
      return `${baseClass} border-emerald-300/35 bg-emerald-500/16 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.22)]`;
    default:
      return `${baseClass} border-white/10 bg-white/8 text-white/82`;
  }
}

function formatRelativeAge(isoDate: string | null) {
  if (!isoDate) {
    return "just now";
  }

  const elapsedMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.floor(elapsedMs / (1000 * 60)));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day`;
}

function formatClock(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function formatCountdown(secondsRemaining: number) {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
