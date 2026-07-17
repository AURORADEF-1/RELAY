"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { StatusBadge } from "@/components/status-badge";
import type { ConsoleTicket } from "@/lib/console-tickets";
import {
  formatConsoleCurrency,
  formatConsoleDate,
  formatConsoleDateTime,
} from "@/lib/console-tickets";

export function ConsoleTicketDrawer({
  ticket,
  onClose,
}: {
  ticket: ConsoleTicket | null;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ticket) {
      return;
    }

    drawerRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, ticket]);

  if (!ticket) {
    return null;
  }

  const summary = ticket.request_summary?.trim() || ticket.request_details?.trim() || "Untitled request";

  return (
    <>
      <button
        type="button"
        className="console-drawer-scrim"
        aria-label="Close ticket preview"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className="console-ticket-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Ticket ${ticket.job_number ?? ticket.id}`}
        tabIndex={-1}
      >
        <header className="console-drawer-header">
          <div>
            <p>Ticket preview</p>
            <h2>Job {ticket.job_number?.trim() || "—"}</h2>
          </div>
          <button type="button" className="console-icon-button" onClick={onClose} aria-label="Close preview">
            <ConsoleIcon name="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="console-drawer-body">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status ?? "PENDING"} />
            {ticket.is_urgent ? <span className="console-urgent-badge">Urgent</span> : null}
          </div>
          <h3>{summary}</h3>
          <p className="console-drawer-description">
            {ticket.request_details?.trim() || "No extended request details recorded."}
          </p>

          <dl className="console-drawer-data">
            <DrawerDatum label="Machine reference" value={ticket.machine_reference} />
            <DrawerDatum label="Requester" value={ticket.requester_name} />
            <DrawerDatum label="Department" value={ticket.department} />
            <DrawerDatum label="Assigned operator" value={ticket.assigned_to} />
            <DrawerDatum label="Expected delivery" value={formatConsoleDate(ticket.expected_delivery_date)} />
            <DrawerDatum label="Supplier" value={ticket.supplier_name} />
            <DrawerDatum label="Purchase order" value={ticket.purchase_order_number} mono />
            <DrawerDatum label="Order value" value={formatConsoleCurrency(ticket.order_amount)} mono />
            <DrawerDatum label="Bin location" value={ticket.bin_location} />
            <DrawerDatum label="Last updated" value={formatConsoleDateTime(ticket.updated_at)} />
          </dl>

          <section className="console-drawer-note">
            <span>Latest note</span>
            <p>{ticket.latest_note || "No note recorded for this ticket."}</p>
          </section>
        </div>

        <footer className="console-drawer-footer">
          <Link href={`/tickets/${ticket.id}`} className="console-primary-action">
            Open ticket workspace
            <ConsoleIcon name="chevron" className="h-4 w-4" />
          </Link>
        </footer>
      </aside>
    </>
  );
}

function DrawerDatum({
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
