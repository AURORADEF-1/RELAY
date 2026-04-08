"use client";

import Link from "next/link";
import {
  buildOrdersSnapshot,
  formatSupplierSpend,
  type SupplierOrderSummary,
} from "@/lib/order-analytics";
import {
  formatOperationalDate,
  formatOrderAmount,
  isTicketOrderOverdue,
  type TicketOperationalRecord,
} from "@/lib/ticket-operational";

type OrderTicket = TicketOperationalRecord & {
  requester_name?: string | null;
  machine_reference?: string | null;
  request_summary?: string | null;
  request_details?: string | null;
  assigned_to?: string | null;
};

export function PartsOrdersDashboard({
  orders,
  isLoading,
  errorMessage,
  isRefreshing,
  onRefresh,
}: {
  orders: OrderTicket[];
  isLoading: boolean;
  errorMessage: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const snapshot = buildOrdersSnapshot(orders);

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Orders Control
          </p>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Review active and historical parts orders, flag overdue supplier follow-up, and track spend concentration by supplier without loading the live queue view.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Orders"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OrdersMetricCard
          label="Tracked Orders"
          value={String(snapshot.trackedOrders.length)}
          helper="Tickets with recorded ORDERED metadata."
        />
        <OrdersMetricCard
          label="Open Orders"
          value={String(snapshot.openOrdersCount)}
          helper="Currently sitting in ORDERED."
        />
        <OrdersMetricCard
          label="Overdue"
          value={String(snapshot.overdueOrders.length)}
          helper="Expected delivery passed without dismissal."
          tone={snapshot.overdueOrders.length > 0 ? "warning" : "default"}
        />
        <OrdersMetricCard
          label="Total Spend"
          value={formatSupplierSpend(snapshot.totalSpend)}
          helper="Sum of stored order amounts."
        />
        <OrdersMetricCard
          label="Suppliers"
          value={String(snapshot.supplierCount)}
          helper="Distinct supplier names captured."
        />
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Overdue Orders
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Supplier follow-up needed on overdue lines.
              </p>
            </div>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
              {snapshot.overdueOrders.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <EmptyStateCard message="Loading order alerts..." />
            ) : snapshot.overdueOrders.length === 0 ? (
              <EmptyStateCard message="No overdue orders at the moment." />
            ) : (
              snapshot.overdueOrders.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/tickets/${ticket.id}`}
                  className="block rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {ticket.job_number ? `Job ${ticket.job_number}` : ticket.machine_reference ?? "Order"}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {ticket.supplier_name ?? "Supplier missing"} · {ticket.purchase_order_number ?? "PO missing"}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                      Overdue
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {ticket.request_summary ?? ticket.request_details ?? "No request summary provided."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                    <span>Expected {formatOperationalDate(ticket.expected_delivery_date)}</span>
                    <span>{formatOrderAmount(ticket.order_amount)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Supplier Spend Summary
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Frequency and spend by captured supplier name.
            </p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <th className="pb-3 pr-4">Supplier</th>
                  <th className="pb-3 pr-4">Orders</th>
                  <th className="pb-3 pr-4">Spend</th>
                  <th className="pb-3 pr-4">Overdue</th>
                  <th className="pb-3">Last Ordered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-slate-500">
                      Loading supplier summary...
                    </td>
                  </tr>
                ) : snapshot.supplierSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-slate-500">
                      No supplier spend has been recorded yet.
                    </td>
                  </tr>
                ) : (
                  snapshot.supplierSummaries.map((summary) => (
                    <SupplierSummaryRow key={summary.normalizedSupplierName} summary={summary} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Order Register
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Full tracked order view across ORDERED, READY, and completed tickets with stored order metadata.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="pb-3 pr-4">Ticket</th>
                <th className="pb-3 pr-4">Supplier</th>
                <th className="pb-3 pr-4">PO</th>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Expected</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Ordered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-6 text-slate-500">
                    Loading orders...
                  </td>
                </tr>
              ) : snapshot.trackedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-slate-500">
                    No tracked orders found yet.
                  </td>
                </tr>
              ) : (
                snapshot.trackedOrders.map((ticket) => (
                  <tr key={ticket.id} className="align-top">
                    <td className="py-4 pr-4">
                      <Link href={`/tickets/${ticket.id}`} className="font-semibold text-slate-900 transition hover:text-slate-600">
                        {ticket.job_number ? `Job ${ticket.job_number}` : ticket.machine_reference ?? ticket.id.slice(0, 8)}
                      </Link>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                        {ticket.request_summary ?? ticket.request_details ?? "No request summary provided."}
                      </p>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">{ticket.supplier_name ?? "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">{ticket.purchase_order_number ?? "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatOrderAmount(ticket.order_amount)}</td>
                    <td className="py-4 pr-4 text-slate-700">
                      <span>{formatOperationalDate(ticket.expected_delivery_date)}</span>
                      {isTicketOrderOverdue(ticket) ? (
                        <span className="ml-2 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                          Overdue
                        </span>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 text-slate-700">{ticket.status ?? "-"}</td>
                    <td className="py-4 text-slate-700">{formatOperationalDate(ticket.ordered_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function OrdersMetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function SupplierSummaryRow({ summary }: { summary: SupplierOrderSummary }) {
  return (
    <tr className="align-top">
      <td className="py-4 pr-4 font-semibold text-slate-900">{summary.supplierName}</td>
      <td className="py-4 pr-4 text-slate-700">{summary.orderCount}</td>
      <td className="py-4 pr-4 text-slate-700">{formatSupplierSpend(summary.totalSpend)}</td>
      <td className="py-4 pr-4 text-slate-700">{summary.overdueCount}</td>
      <td className="py-4 text-slate-700">{formatOperationalDate(summary.lastOrderedAt)}</td>
    </tr>
  );
}

function EmptyStateCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
      {message}
    </div>
  );
}
