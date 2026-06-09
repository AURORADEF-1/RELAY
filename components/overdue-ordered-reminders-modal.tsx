"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type OverdueTicketReminder = {
  id: string;
  jobNumber: string | null;
  requestSummary: string | null;
  expectedDeliveryDate: string | null;
};

type OverdueOrderedRemindersModalProps = {
  tickets: OverdueTicketReminder[];
  dismissingTicketId?: string | null;
  onDismissTicket: (ticketId: string) => void;
};

export function OverdueOrderedRemindersModal({
  tickets,
  dismissingTicketId,
  onDismissTicket,
}: OverdueOrderedRemindersModalProps) {
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const signature = useMemo(() => tickets.map((ticket) => ticket.id).join("|"), [tickets]);

  if (tickets.length === 0) {
    return null;
  }

  if (dismissedSignature === signature) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/76 px-4 py-6 backdrop-blur-sm"
      onClick={() => setDismissedSignature(signature)}
    >
      <div
        className="relative w-full max-w-3xl rounded-[1.9rem] border border-[color:var(--border-strong)] bg-[color:var(--background-panel)] p-5 shadow-[0_40px_110px_-48px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Overdue ordered parts reminders"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setDismissedSignature(signature)}
          aria-label="Close overdue orders reminder"
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--background-panel)] text-[color:var(--foreground-muted)] transition hover:border-[color:var(--foreground-subtle)] hover:text-[color:var(--foreground-strong)]"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            →
          </span>
        </button>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--foreground-subtle)]">
            Overdue Orders
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground-strong)]">
            Ordered parts require supplier follow-up
          </h2>
          <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
            Dismiss each reminder manually or update the expected delivery date on the ticket.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className="relative rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4 pr-14"
            >
              <button
                type="button"
                onClick={() => onDismissTicket(ticket.id)}
                disabled={dismissingTicketId === ticket.id}
                aria-label={`Dismiss reminder for ${ticket.jobNumber ? `job ${ticket.jobNumber}` : "this ticket"}`}
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--background-panel)] text-[color:var(--foreground-muted)] transition hover:border-[color:var(--foreground-subtle)] hover:text-[color:var(--foreground-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  →
                </span>
              </button>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                    {ticket.jobNumber
                      ? `Job ${ticket.jobNumber} – parts order overdue. Contact supplier.`
                      : "Parts order overdue. Contact supplier."}
                  </p>
                  <p className="break-words text-sm text-[color:var(--foreground-muted)]">
                    {ticket.requestSummary?.trim() || "No request summary recorded."}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--warning)]">
                    Expected delivery {ticket.expectedDeliveryDate ?? "-"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href={`/tickets/${ticket.id}`} className="aurora-button-secondary">
                    View Ticket
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
