"use client";

import { ConsoleIcon } from "@/components/console/console-icon";
import { MachineReferenceIndicator } from "@/components/machine-reference-indicator";
import { StatusBadge } from "@/components/status-badge";
import type { ConsoleTicket } from "@/lib/console-tickets";
import { formatConsoleCurrency, formatConsoleDate } from "@/lib/console-tickets";

export function ConsoleDynamicTicketCard({
  ticket,
  selected,
  onSelect,
}: {
  ticket: ConsoleTicket;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = ticket.status?.trim().toUpperCase() || "PENDING";
  const summary = ticket.request_summary?.trim() || ticket.request_details?.trim() || "Untitled request";

  return (
    <article
      className={`console-dynamic-card ${selected ? "console-dynamic-card-selected" : ""}`}
      data-status={status}
    >
      <button
        type="button"
        className="console-dynamic-card-button"
        onClick={onSelect}
        aria-label={`Preview job ${ticket.job_number?.trim() || ticket.id}: ${summary}`}
        aria-pressed={selected}
      >
        <span className="sr-only">Preview ticket</span>
      </button>

      <div className="console-dynamic-card-content">
        <header className="console-dynamic-card-header">
          <div className="min-w-0">
            <p className="console-dynamic-card-kicker">Active job</p>
            <h3><span>JOB</span> {ticket.job_number?.trim() || "—"}</h3>
          </div>
          <div className="console-dynamic-card-state">
            {ticket.is_urgent ? <strong>Urgent</strong> : null}
            <StatusBadge status={status} />
          </div>
        </header>

        <p className="console-dynamic-card-summary">{summary}</p>

        <div className="console-dynamic-machine">
          <span>Machine</span>
          <MachineReferenceIndicator machine={ticket} />
        </div>

        <dl className="console-dynamic-data">
          <DynamicDatum label="Requester" value={ticket.requester_name} />
          <DynamicDatum label="Department" value={ticket.department} />
          <DynamicDatum label="Assigned" value={ticket.assigned_to || "Stores queue"} />
          <DynamicDatum label="Expected" value={formatConsoleDate(ticket.expected_delivery_date)} />
          <DynamicDatum label="Supplier" value={ticket.supplier_name} />
          <DynamicDatum label="PO number" value={ticket.purchase_order_number} mono />
          <DynamicDatum label="Order value" value={formatConsoleCurrency(ticket.order_amount)} mono />
          <DynamicDatum label="Bin" value={ticket.bin_location} />
        </dl>

        <footer className="console-dynamic-card-footer">
          <div>
            <span>Latest activity</span>
            <p>{ticket.latest_note || "No note recorded"}</p>
          </div>
          <ConsoleIcon name="chevron" className="h-4 w-4 shrink-0" />
        </footer>
      </div>
    </article>
  );
}

function DynamicDatum({
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
