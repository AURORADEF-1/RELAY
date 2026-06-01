"use client";

import type { SupplierOrderDispatchPreference } from "@/lib/order-communications";

type TicketStatusWorkflowModalProps = {
  mode: "ordered" | "ready";
  isSubmitting?: boolean;
  expectedDeliveryDate: string;
  leadTimeNote: string;
  purchaseOrderNumber: string;
  supplierName: string;
  supplierEmail: string;
  supplierSuggestions?: string[];
  orderAmount: string;
  binLocation: string;
  dispatchPreference: SupplierOrderDispatchPreference;
  errorMessage?: string;
  onExpectedDeliveryDateChange: (value: string) => void;
  onLeadTimeNoteChange: (value: string) => void;
  onPurchaseOrderNumberChange: (value: string) => void;
  onSupplierNameChange: (value: string) => void;
  onSupplierEmailChange: (value: string) => void;
  onOrderAmountChange: (value: string) => void;
  onBinLocationChange: (value: string) => void;
  onDispatchPreferenceChange: (value: SupplierOrderDispatchPreference) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function TicketStatusWorkflowModal({
  mode,
  isSubmitting = false,
  expectedDeliveryDate,
  leadTimeNote,
  purchaseOrderNumber,
  supplierName,
  supplierEmail,
  supplierSuggestions = [],
  orderAmount,
  binLocation,
  dispatchPreference,
  errorMessage,
  onExpectedDeliveryDateChange,
  onLeadTimeNoteChange,
  onPurchaseOrderNumberChange,
  onSupplierNameChange,
  onSupplierEmailChange,
  onOrderAmountChange,
  onBinLocationChange,
  onDispatchPreferenceChange,
  onConfirm,
  onCancel,
}: TicketStatusWorkflowModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.8rem] border border-[color:var(--border-strong)] bg-[color:var(--background-panel)] p-5 shadow-[0_36px_100px_-42px_rgba(0,0,0,0.76)] backdrop-blur-xl sm:p-6 lg:max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--foreground-subtle)]">
              Status Control
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground-strong)]">
              {mode === "ordered" ? "ORDERED requires supplier details" : "READY requires bin location"}
            </h2>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
              {mode === "ordered"
                ? "Set expected delivery, PO, supplier, and order value before saving this ticket as ORDERED. Saving will draft the supplier message and email Parts for records."
                : "Enter the collection bin location before marking this ticket READY."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--foreground-strong)]"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {mode === "ordered" ? (
            <>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                  Expected Delivery Date
                </span>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(event) => onExpectedDeliveryDateChange(event.target.value)}
                  className="aurora-input"
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    PO Number
                  </span>
                  <input
                    type="text"
                    value={purchaseOrderNumber}
                    onChange={(event) => onPurchaseOrderNumberChange(event.target.value)}
                    placeholder="Enter purchase order number"
                    className="aurora-input"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    Supplier
                  </span>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(event) => onSupplierNameChange(event.target.value)}
                    list="supplier-suggestions"
                    placeholder="Type or select supplier name"
                    className="aurora-input"
                  />
                  <datalist id="supplier-suggestions">
                    {supplierSuggestions.map((supplier) => (
                      <option key={supplier} value={supplier} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                  Supplier Email
                </span>
                <input
                  type="email"
                  value={supplierEmail}
                  onChange={(event) => onSupplierEmailChange(event.target.value)}
                  placeholder="supplier@example.com"
                  className="aurora-input"
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    Supplier Email
                  </span>
                  <input
                    type="email"
                    value={supplierEmail}
                    onChange={(event) => onSupplierEmailChange(event.target.value)}
                    placeholder="supplier@example.com"
                    className="aurora-input"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    Send Supplier Draft Now
                  </span>
                  <select
                    value={dispatchPreference}
                    onChange={(event) =>
                      onDispatchPreferenceChange(event.target.value as SupplierOrderDispatchPreference)
                    }
                    className="aurora-input"
                  >
                    <option value="none">Do not send now</option>
                    <option value="email">Open email draft</option>
                    <option value="whatsapp">Open WhatsApp in new window</option>
                  </select>
                  <p className="text-xs leading-5 text-[color:var(--foreground-muted)]">
                    The supplier draft can be opened after saving. WhatsApp opens in a new window so Relay stays open.
                  </p>
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    Order Amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={orderAmount}
                    onChange={(event) => onOrderAmountChange(event.target.value)}
                    placeholder="0.00"
                    className="aurora-input"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    Lead Time Note
                  </span>
                  <textarea
                    value={leadTimeNote}
                    onChange={(event) => onLeadTimeNoteChange(event.target.value)}
                    rows={3}
                    placeholder="Optional supplier note or lead time detail."
                    className="aurora-textarea min-h-[7.5rem]"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                Bin Location
              </span>
              <input
                type="text"
                value={binLocation}
                onChange={(event) => onBinLocationChange(event.target.value)}
                placeholder="Enter Stores bin location"
                className="aurora-input"
              />
            </label>
          )}

          {errorMessage ? (
            <div className="aurora-alert aurora-alert-error">{errorMessage}</div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="aurora-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="aurora-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : mode === "ordered" ? "Save ORDERED & Send" : "Save READY"}
          </button>
        </div>
      </div>
    </div>
  );
}
