"use client";

type TicketStatusWorkflowModalProps = {
  mode: "ordered" | "ready";
  isSubmitting?: boolean;
  expectedDeliveryDate: string;
  leadTimeNote: string;
  binLocation: string;
  errorMessage?: string;
  onExpectedDeliveryDateChange: (value: string) => void;
  onLeadTimeNoteChange: (value: string) => void;
  onBinLocationChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function TicketStatusWorkflowModal({
  mode,
  isSubmitting = false,
  expectedDeliveryDate,
  leadTimeNote,
  binLocation,
  errorMessage,
  onExpectedDeliveryDateChange,
  onLeadTimeNoteChange,
  onBinLocationChange,
  onConfirm,
  onCancel,
}: TicketStatusWorkflowModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[1.8rem] border border-[color:var(--border-strong)] bg-[color:var(--background-panel)] p-5 shadow-[0_36px_100px_-42px_rgba(0,0,0,0.76)] backdrop-blur-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--foreground-subtle)]">
              Status Control
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground-strong)]">
              {mode === "ordered" ? "ORDERED requires expected delivery" : "READY requires bin location"}
            </h2>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
              {mode === "ordered"
                ? "Set the expected delivery date before saving this ticket as ORDERED."
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
            {isSubmitting ? "Saving..." : mode === "ordered" ? "Save ORDERED" : "Save READY"}
          </button>
        </div>
      </div>
    </div>
  );
}
