"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MachineReferenceDetails = {
  machine_reference?: string | null;
  machine_number?: string | null;
  machine_make?: string | null;
  machine_model?: string | null;
  machine_serial_number?: string | null;
  machine_verified?: boolean | null;
};

export function MachineReferenceIndicator({
  machine,
  prefix,
  className = "",
}: {
  machine: MachineReferenceDetails;
  prefix?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 16, top: 16 });
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const reference = machine.machine_number?.trim() || machine.machine_reference?.trim() || "-";
  const verified = Boolean(machine.machine_verified);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !popoverRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function closePopover() {
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closePopover);
    window.addEventListener("scroll", closePopover, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closePopover);
      window.removeEventListener("scroll", closePopover, true);
    };
  }, [isOpen]);

  function handleToggle() {
    if (!isOpen && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = Math.min(288, window.innerWidth - 32);
      const opensBelow = triggerRect.bottom + 270 <= window.innerHeight;
      setPopoverPosition({
        left: Math.min(Math.max(16, triggerRect.left), window.innerWidth - popoverWidth - 16),
        top: opensBelow ? triggerRect.bottom + 8 : Math.max(16, triggerRect.top - 250),
      });
    }

    setIsOpen((current) => !current);
  }

  async function handleCopy() {
    const details = [
      `Machine: ${reference}`,
      `Make: ${machine.machine_make?.trim() || "-"}`,
      `Model: ${machine.machine_model?.trim() || "-"}`,
      `Serial number: ${machine.machine_serial_number?.trim() || "-"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy machine details:", details);
    }
  }

  return (
    <span ref={containerRef} className={`pointer-events-auto relative z-20 inline-flex max-w-full items-center gap-2 ${className}`}>
      <span className="truncate">{prefix}{reference}</span>
      {verified ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            onClick={handleToggle}
            aria-label={`Show verified machine details for ${reference}`}
            aria-expanded={isOpen}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" aria-hidden="true" />
          </button>
          {isOpen && typeof document !== "undefined" ? createPortal(
            <span
              ref={popoverRef}
              role="dialog"
              aria-label={`Verified machine ${reference}`}
              className="fixed z-[100] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-700 shadow-[0_20px_55px_-24px_rgba(15,23,42,0.45)]"
              style={popoverPosition}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Verified machine
              </span>
              <span className="mt-3 grid grid-cols-2 gap-3">
                <MachineDatum label="Make" value={machine.machine_make} />
                <MachineDatum label="Model" value={machine.machine_model} />
                <MachineDatum label="Serial number" value={machine.machine_serial_number} wide mono />
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                {copied ? "Copied" : "Copy details"}
              </button>
            </span>,
            document.body,
          ) : null}
        </>
      ) : null}
    </span>
  );
}

function MachineDatum({
  label,
  value,
  wide = false,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
  mono?: boolean;
}) {
  return (
    <span className={wide ? "col-span-2" : undefined}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className={`mt-1 block break-words text-sm font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value?.trim() || "-"}
      </span>
    </span>
  );
}
