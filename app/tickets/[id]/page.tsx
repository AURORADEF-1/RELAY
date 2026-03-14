"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { LogoutButton } from "@/components/logout-button";
import { StatusBadge } from "@/components/status-badge";
import { getSupabaseClient } from "@/lib/supabase";

type TicketRecord = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_details: string | null;
  request_summary: string | null;
  status: string | null;
  assigned_to: string | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type TicketUpdate = {
  id?: string;
  status?: string | null;
  comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTicket() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (!isMounted) {
        return;
      }

      if (ticketError) {
        setErrorMessage(ticketError.message);
        setIsLoading(false);
        return;
      }

      const { data: updateData, error: updatesError } = await supabase
        .from("ticket_updates")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (updatesError) {
        setErrorMessage(updatesError.message);
        setTicket(ticketData as TicketRecord);
        setUpdates([]);
        setIsLoading(false);
        return;
      }

      setTicket(ticketData as TicketRecord);
      setUpdates((updateData ?? []) as TicketUpdate[]);
      setIsLoading(false);
    }

    loadTicket();

    return () => {
      isMounted = false;
    };
  }, [ticketId]);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
            </Link>
            <Link
              href="/admin"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Admin
            </Link>
          </div>
          <LogoutButton />
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
              <div className="space-y-5">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  RELAY
                </p>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Ticket Detail
                </h1>
                <p className="text-base leading-8 text-slate-600">
                  Review request information, workflow history, and ticket
                  commentary in one place.
                </p>
              </div>
              <div className="self-start">
                <Link
                  href="/requests"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Back to Requests
                </Link>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Loading ticket...
              </div>
            ) : ticket ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Ticket ID
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {ticket.id}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status ?? "PENDING"} />
                  </div>

                  <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                    <DetailItem label="Requester" value={ticket.requester_name} />
                    <DetailItem label="Department" value={ticket.department} />
                    <DetailItem label="Machine" value={ticket.machine_reference} />
                    <DetailItem label="Job Number" value={ticket.job_number} />
                    <DetailItem label="Assigned To" value={ticket.assigned_to} />
                    <DetailItem
                      label="Updated"
                      value={formatDate(ticket.updated_at)}
                    />
                  </dl>

                  <div className="mt-6 space-y-4">
                    <DetailBlock
                      label="Request Details"
                      value={ticket.request_details ?? ticket.request_summary}
                    />
                    <DetailBlock label="Admin Notes" value={ticket.notes} />
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Status History & Comments
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      Activity from status changes and comment updates.
                    </p>
                  </div>

                  <div className="mt-6 space-y-4">
                    {updates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                        No history entries found for this ticket yet.
                      </div>
                    ) : (
                      updates.map((update, index) => (
                        <article
                          key={update.id ?? `${update.created_at}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-white p-5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <StatusBadge
                              status={update.status ?? ticket.status ?? "PENDING"}
                            />
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {formatDateTime(update.created_at)}
                            </p>
                          </div>
                          <p className="mt-4 text-sm leading-7 text-slate-600">
                            {update.comment ?? update.notes ?? "Status updated."}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Ticket not found.
              </div>
            )}
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-7 text-slate-700">{value || "-"}</dd>
    </div>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
