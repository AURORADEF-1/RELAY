"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildSupplierOrderMailto } from "@/lib/order-communications";
import { buildRetailCustomerComment, buildRetailCustomerDispatchPlan } from "@/lib/retail-sales";
import type { MyJobTicket, MyJobsColumn } from "@/lib/my-jobs";
import { notifyRequesterStatusChanged } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import type { TicketStatus } from "@/lib/statuses";
import {
  buildOrderedWorkflowComment,
  buildReadyWorkflowComment,
  parseDueDateToEndOfDay,
  parseOrderAmountInput,
} from "@/lib/ticket-operational";
import { fetchTicketParts, formatOutstandingTicketParts, getOutstandingTicketParts } from "@/lib/ticket-parts";
import { formatSupplierDisplayName, normalizeSupplierEmail } from "@/lib/suppliers";
import { getSupabaseClient } from "@/lib/supabase";

export type MyJobMove = {
  ticket: MyJobTicket;
  column: MyJobsColumn;
};

export function MyJobStatusModal({
  move,
  operatorLabel,
  onClose,
  onSaved,
}: {
  move: MyJobMove | null;
  operatorLabel: string;
  onClose: () => void;
  onSaved: (ticket: MyJobTicket) => void;
}) {
  const [nextStatus, setNextStatus] = useState<TicketStatus>("PENDING");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [binLocation, setBinLocation] = useState("");
  const [retailSalesReference, setRetailSalesReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [retailDeliveryMethod, setRetailDeliveryMethod] = useState<"" | "collect" | "delivery">("");
  const [retailDeliveryAddress, setRetailDeliveryAddress] = useState("");
  const [retailApcTrackingNumber, setRetailApcTrackingNumber] = useState("");
  const [note, setNote] = useState("");
  const [draftEmail, setDraftEmail] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const headingId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!move) return;
    const { ticket, column } = move;
    setNextStatus(column.statuses[0]);
    setExpectedDeliveryDate(ticket.expected_delivery_date?.slice(0, 10) ?? "");
    setPurchaseOrderNumber(ticket.purchase_order_number ?? "");
    setSupplierName(ticket.supplier_name ?? "");
    setSupplierEmail(ticket.supplier_email ?? "");
    setOrderAmount(typeof ticket.order_amount === "number" ? String(ticket.order_amount) : "");
    setBinLocation(ticket.bin_location ?? "");
    setRetailSalesReference(ticket.retail_sales_reference ?? "");
    setCustomerName(ticket.customer_name ?? "");
    setCustomerEmail(ticket.customer_email ?? "");
    setCustomerPhone(ticket.customer_phone ?? "");
    setRetailDeliveryMethod(ticket.retail_delivery_method ?? "");
    setRetailDeliveryAddress(ticket.retail_delivery_address ?? "");
    setRetailApcTrackingNumber(ticket.retail_apc_tracking_number ?? "");
    setNote("");
    setDraftEmail(!ticket.is_retail_sale);
    setErrorMessage("");

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timeoutId = window.setTimeout(() => dialogRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [move]);

  if (!move) return null;

  const { ticket, column } = move;
  const movingOrderedToReady = ticket.status === "ORDERED" && nextStatus === "READY";
  const movingToOrdered = nextStatus === "ORDERED";

  async function handleSave() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setErrorMessage("");
    if (nextStatus === ticket.status) {
      setErrorMessage("This job is already in that status.");
      return;
    }

    const normalizedDate = expectedDeliveryDate.trim();
    const normalizedPo = purchaseOrderNumber.trim();
    const normalizedSupplier = formatSupplierDisplayName(supplierName);
    const normalizedSupplierEmail = normalizeSupplierEmail(supplierEmail);
    const parsedAmount = parseOrderAmountInput(orderAmount);
    const normalizedBin = binLocation.trim();
    const normalizedSalesReference = retailSalesReference.trim();
    const normalizedCustomerName = customerName.trim();
    const normalizedCustomerEmail = customerEmail.trim();
    const normalizedCustomerPhone = customerPhone.trim();
    const normalizedDeliveryAddress = retailDeliveryAddress.trim();
    const normalizedTrackingNumber = retailApcTrackingNumber.trim();

    if (movingToOrdered) {
      if (!normalizedDate || !parseDueDateToEndOfDay(normalizedDate)) {
        setErrorMessage("Enter a valid expected delivery date.");
        return;
      }
      if (!normalizedPo) {
        setErrorMessage("PO number is required before moving this job to ORDERED.");
        return;
      }
      if (!normalizedSupplier) {
        setErrorMessage("Supplier is required before moving this job to ORDERED.");
        return;
      }
      if (!ticket.is_retail_sale && (!orderAmount.trim() || parsedAmount == null || Number.isNaN(parsedAmount))) {
        setErrorMessage("Enter a valid non-negative order value.");
        return;
      }
      if (!ticket.is_retail_sale && draftEmail && !normalizedSupplierEmail) {
        setErrorMessage("Supplier email is required when Draft supplier email is selected.");
        return;
      }
      if (ticket.is_retail_sale) {
        if (!normalizedSalesReference) {
          setErrorMessage("Sales reference is required for a retail order.");
          return;
        }
        if (!normalizedCustomerName) {
          setErrorMessage("Customer name is required for a retail order.");
          return;
        }
        if (!normalizedCustomerEmail && !normalizedCustomerPhone) {
          setErrorMessage("Customer email or phone is required for a retail order.");
          return;
        }
        if (!retailDeliveryMethod) {
          setErrorMessage("Choose collection or delivery for this retail order.");
          return;
        }
        if (retailDeliveryMethod === "delivery" && !normalizedDeliveryAddress) {
          setErrorMessage("Delivery address is required when delivery is selected.");
          return;
        }
        if (retailDeliveryMethod === "delivery" && !normalizedTrackingNumber) {
          setErrorMessage("APC tracking number is required for a retail delivery.");
          return;
        }
      }
    }

    if (movingOrderedToReady && !normalizedBin && !(ticket.is_retail_sale && retailDeliveryMethod === "delivery")) {
      setErrorMessage("Bin location is required before moving this ORDERED job to READY.");
      return;
    }

    setIsSaving(true);
    try {
      const { user, profile, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
      if (!user || !isAdmin) throw new Error("Admin access is required.");

      if (movingOrderedToReady) {
        const parts = await fetchTicketParts(supabase, ticket.id);
        const outstanding = getOutstandingTicketParts(parts);
        if (outstanding.length > 0) {
          throw new Error(`Receive all linked parts before moving to READY. Outstanding: ${formatOutstandingTicketParts(outstanding)}`);
        }
      }

      const actorName = profile?.display_name?.trim() || user.email?.split("@")[0] || operatorLabel;
      const changedAt = new Date().toISOString();
      const updatePayload: Record<string, string | number | null> = {
        status: nextStatus,
        updated_at: changedAt,
      };

      if (movingToOrdered) {
        updatePayload.expected_delivery_date = normalizedDate;
        updatePayload.purchase_order_number = normalizedPo;
        updatePayload.supplier_name = normalizedSupplier;
        updatePayload.supplier_email = normalizedSupplierEmail || null;
        updatePayload.order_amount = parsedAmount;
        updatePayload.ordered_at = changedAt;
        updatePayload.ordered_by = actorName;
        if (ticket.is_retail_sale) {
          updatePayload.retail_sales_reference = normalizedSalesReference;
          updatePayload.customer_name = normalizedCustomerName;
          updatePayload.customer_email = normalizedCustomerEmail || null;
          updatePayload.customer_phone = normalizedCustomerPhone || null;
          updatePayload.retail_delivery_method = retailDeliveryMethod;
          updatePayload.retail_delivery_address = normalizedDeliveryAddress || null;
          updatePayload.retail_apc_tracking_number = normalizedTrackingNumber || null;
        }
      } else if (movingOrderedToReady) {
        updatePayload.bin_location = normalizedBin;
        updatePayload.ready_at = changedAt;
        updatePayload.ready_by = actorName;
      }

      let query = supabase.from("tickets").update(updatePayload).eq("id", ticket.id);
      if (ticket.updated_at) query = query.eq("updated_at", ticket.updated_at);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("This job changed in another session. Refresh and try again.");

      const savedTicket = { ...ticket, ...data, latest_note: note.trim() || ticket.latest_note } as MyJobTicket;
      const comments = [`Status updated from ${ticket.status ?? "PENDING"} to ${nextStatus} by ${actorName}.`];
      if (movingToOrdered && !ticket.is_retail_sale) {
        comments.push(buildOrderedWorkflowComment({
          expectedDeliveryDate: normalizedDate,
          purchaseOrderNumber: normalizedPo,
          supplierName: normalizedSupplier,
          supplierEmail: normalizedSupplierEmail,
          orderAmount: parsedAmount,
          dispatchSummary: draftEmail ? "supplier email draft requested." : "no supplier message requested.",
          actorName,
        }));
      }
      if (movingToOrdered && ticket.is_retail_sale) comments.push(buildRetailCustomerComment(savedTicket, "ordered"));
      if (movingOrderedToReady && normalizedBin) comments.push(buildReadyWorkflowComment({ binLocation: normalizedBin, actorName }));
      if (movingOrderedToReady && ticket.is_retail_sale) comments.push(buildRetailCustomerComment(savedTicket, "ready"));
      if (note.trim()) comments.push(`Operator update by ${actorName}: ${note.trim()}`);

      const { error: updateError } = await supabase.from("ticket_updates").insert(
        comments.map((comment, index) => ({
          ticket_id: ticket.id,
          status: index === 0 ? nextStatus : undefined,
          comment,
        })),
      );
      if (updateError) throw new Error(updateError.message);

      if (!ticket.is_retail_sale) {
        try {
          await notifyRequesterStatusChanged(supabase, {
            userId: ticket.user_id,
            ticketId: ticket.id,
            jobNumber: ticket.job_number,
            nextStatus,
            requestSummary: ticket.request_summary ?? ticket.request_details,
            assignedTo: ticket.assigned_to,
            binLocation: savedTicket.bin_location,
          });
        } catch (notificationError) {
          console.error("Failed to notify requester about My Jobs status change", notificationError);
        }
      }

      onSaved(savedTicket);
      onClose();
      if (movingToOrdered && draftEmail && !ticket.is_retail_sale) {
        window.setTimeout(() => {
          window.location.href = buildSupplierOrderMailto(savedTicket);
        }, 0);
      } else if (movingOrderedToReady && ticket.is_retail_sale) {
        const plan = buildRetailCustomerDispatchPlan(savedTicket, "ready");
        window.setTimeout(() => {
          if (plan.openInBrowser && plan.customerHref) {
            if (plan.channel === "whatsapp") window.open(plan.customerHref, "_blank", "noopener,noreferrer");
            else window.location.href = plan.customerHref;
          }
        }, 0);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to change this job status.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="my-jobs-modal-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose();
    }}>
      <section ref={dialogRef} className="my-jobs-modal" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
        <header>
          <div>
            <p>Status qualification</p>
            <h2 id={headingId}>Complete details to move JOB {ticket.job_number || ticket.id.slice(0, 8)} to {column.label.toUpperCase()}</h2>
            <span>Add the information RELAY needs before it changes the status.</span>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close status window">×</button>
        </header>

        <div className="my-jobs-modal-body">
          {column.statuses.length > 1 ? (
            <label className="my-jobs-field">
              <span>New status</span>
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as TicketStatus)}>
                {column.statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
          ) : null}

          {movingToOrdered ? (
            <div className="my-jobs-field-grid">
              <label className="my-jobs-field"><span>Expected delivery date</span><input type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} /></label>
              <label className="my-jobs-field"><span>PO number</span><input value={purchaseOrderNumber} onChange={(event) => setPurchaseOrderNumber(event.target.value)} placeholder="MLP-00000" /></label>
              <label className="my-jobs-field"><span>Supplier</span><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier name" /></label>
              {!ticket.is_retail_sale ? <label className="my-jobs-field"><span>Supplier email</span><input type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} placeholder="orders@supplier.co.uk" /></label> : null}
              {!ticket.is_retail_sale ? <label className="my-jobs-field"><span>Order value</span><span className="my-jobs-money-input"><b>£</b><input inputMode="decimal" value={orderAmount} onChange={(event) => setOrderAmount(event.target.value)} placeholder="0.00" /></span></label> : null}
              {!ticket.is_retail_sale ? <label className="my-jobs-dispatch"><input type="checkbox" checked={draftEmail} onChange={(event) => setDraftEmail(event.target.checked)} /><span><strong>Draft supplier email</strong><small>Open a checked email draft after saving.</small></span></label> : null}
              {ticket.is_retail_sale ? <>
                <label className="my-jobs-field"><span>Sales reference</span><input value={retailSalesReference} onChange={(event) => setRetailSalesReference(event.target.value)} /></label>
                <label className="my-jobs-field"><span>Customer name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
                <label className="my-jobs-field"><span>Customer email</span><input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
                <label className="my-jobs-field"><span>Customer phone</span><input type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
                <label className="my-jobs-field"><span>Delivery method</span><select value={retailDeliveryMethod} onChange={(event) => setRetailDeliveryMethod(event.target.value as "" | "collect" | "delivery")}><option value="">Select method</option><option value="collect">Collection</option><option value="delivery">Delivery</option></select></label>
                {retailDeliveryMethod === "delivery" ? <>
                  <label className="my-jobs-field"><span>APC tracking number</span><input value={retailApcTrackingNumber} onChange={(event) => setRetailApcTrackingNumber(event.target.value)} /></label>
                  <label className="my-jobs-field my-jobs-field-span"><span>Delivery address</span><textarea rows={2} value={retailDeliveryAddress} onChange={(event) => setRetailDeliveryAddress(event.target.value)} /></label>
                </> : null}
              </> : null}
            </div>
          ) : null}

          {movingOrderedToReady ? (
            <label className="my-jobs-field"><span>Collection bin location</span><input value={binLocation} onChange={(event) => setBinLocation(event.target.value)} placeholder="For example 5FB" /></label>
          ) : null}

          <label className="my-jobs-field"><span>Update note <em>optional</em></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a concise operational update" /></label>
          {errorMessage ? <div className="my-jobs-modal-error" role="alert">{errorMessage}</div> : null}
          <p className="my-jobs-modal-rule">Status will not change until all required fields and operational checks are complete.</p>
        </div>

        <footer>
          <button type="button" className="my-jobs-button-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="button" className="my-jobs-button-primary" onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Checking…" : `Confirm & move to ${nextStatus.replaceAll("_", " ")}`}</button>
        </footer>
      </section>
    </div>
  );
}
