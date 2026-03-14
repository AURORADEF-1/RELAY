"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { supabase } from "@/lib/supabase";

type Ticket = {
  id: string;
  machine_reference: string | null;
  request_summary: string | null;
  status: string | null;
  updated_at: string | null;
};

const statusOrder = ["PENDING", "QUERY", "ORDERED", "READY", "COMPLETED"] as const;

const statusTones: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  QUERY: "border-orange-200 bg-orange-50 text-orange-900",
  ORDERED: "border-sky-200 bg-sky-50 text-sky-900",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-slate-200 bg-slate-100 text-slate-800",
};

const statusDots: Record<string, string> = {
  PENDING: "bg-amber-500",
  QUERY: "bg-orange-500",
  ORDERED: "bg-sky-500",
  READY: "bg-emerald-500",
  COMPLETED: "bg-slate-500",
};

export default function RequestsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTickets() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError || !user) {
        setTickets([]);
        setErrorMessage("Sign in to view your requests.");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .select("id, machine_reference, request_summary, status, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setTickets([]);
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setTickets(data ?? []);
      setIsLoading(false);
    }

    loadTickets();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Submit Ticket
            </Link>
            <Link
              href="/admin"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Admin
            </Link>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Login
            </Link>
          </div>
          <LogoutButton />
        </nav>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                My Requests
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Track active and completed parts requests with clear status
                visibility across the RELAY workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {statusOrder.map((status) => (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center"
                >
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500">
                    {status}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {tickets.filter((ticket) => ticket.status === status).length}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-6 py-4">Ticket ID</th>
                    <th className="px-6 py-4">Machine Reference</th>
                    <th className="px-6 py-4">Request Summary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        Loading requests...
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        No requests found.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket) => (
                    <tr key={ticket.id} className="align-top">
                      <td className="px-6 py-5 text-sm font-semibold text-slate-900">
                        {ticket.id}
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {ticket.machine_reference ?? "-"}
                      </td>
                      <td className="px-6 py-5 text-sm leading-7 text-slate-600">
                        {ticket.request_summary ?? "-"}
                      </td>
                      <td className="px-6 py-5">
                        <StatusBadge status={ticket.status ?? "PENDING"} />
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-500">
                        {formatDate(ticket.updated_at)}
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 bg-slate-50 p-4 lg:hidden">
              {isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Loading requests...
                </div>
              ) : tickets.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  No requests found.
                </div>
              ) : (
                tickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {ticket.id}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {ticket.machine_reference ?? "-"}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status ?? "PENDING"} />
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600">
                      {ticket.request_summary ?? "-"}
                    </p>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Updated {formatDate(ticket.updated_at)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold tracking-[0.14em] ${
        statusTones[status] ?? "border-slate-200 bg-slate-100 text-slate-800"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${statusDots[status] ?? "bg-slate-500"}`} />
      {status}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
