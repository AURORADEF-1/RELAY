"use client";

import Link from "next/link";

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
  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/76 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[1.9rem] border border-[color:var(--border-strong)] bg-[color:var(--background-panel)] p-5 shadow-[0_40px_110px_-48px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-6">
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
              className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                    {ticket.jobNumber
                      ? `Job ${ticket.jobNumber} – parts order overdue. Contact supplier.`
                      : "Parts order overdue. Contact supplier."}
                  </p>
                  <p className="text-sm text-[color:var(--foreground-muted)]">
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
                  <button
                    type="button"
                    onClick={() => onDismissTicket(ticket.id)}
                    disabled={dismissingTicketId === ticket.id}
                    className="aurora-button disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {dismissingTicketId === ticket.id ? "Dismissing..." : "Dismiss"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
