"use client";

import { StatusBadge } from "@/components/status-badge";
import { ConsoleIcon } from "@/components/console/console-icon";
import type { ConsoleTicket } from "@/lib/console-tickets";
import { formatConsoleCurrency, formatConsoleDate } from "@/lib/console-tickets";

export function ConsoleTicketCard({
  ticket,
  selected,
  onSelect,
}: {
  ticket: ConsoleTicket;
  selected: boolean;
  onSelect: () => void;
}) {
  const summary = ticket.request_summary?.trim() || ticket.request_details?.trim() || "Untitled request";

  return (
    <article className={`console-ticket-card ${selected ? "console-ticket-card-selected" : ""}`}>
      <button
        type="button"
        className="console-ticket-card-button"
        onClick={onSelect}
        aria-label={`Preview job ${ticket.job_number?.trim() || ticket.id}: ${summary}`}
        aria-pressed={selected}
      >
        <span className="sr-only">Preview ticket</span>
      </button>
      <div className="console-ticket-card-content">
        <div className="console-ticket-card-heading">
          <div className="min-w-0">
            <div className="console-ticket-card-reference">
              <span>JOB {ticket.job_number?.trim() || "—"}</span>
              {ticket.is_urgent ? <strong>Urgent</strong> : null}
            </div>
            <h3>{summary}</h3>
          </div>
          <StatusBadge status={ticket.status ?? "PENDING"} />
        </div>

        <dl className="console-ticket-card-grid">
          <TicketDatum label="Machine" value={ticket.machine_reference} />
          <TicketDatum label="Requester" value={ticket.requester_name} />
          <TicketDatum label="Assigned" value={ticket.assigned_to} />
          <TicketDatum label="Expected" value={formatConsoleDate(ticket.expected_delivery_date)} />
          <TicketDatum label="Supplier" value={ticket.supplier_name} />
          <TicketDatum label="PO" value={ticket.purchase_order_number} mono />
          <TicketDatum label="Value" value={formatConsoleCurrency(ticket.order_amount)} mono />
        </dl>

        <div className="console-ticket-card-note">
          <div>
            <span>Latest note</span>
            <p>{ticket.latest_note || "No note recorded"}</p>
          </div>
          <ConsoleIcon name="chevron" className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </article>
  );
}

function TicketDatum({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value?.trim() || "—"}</dd>
    </div>
  );
}
