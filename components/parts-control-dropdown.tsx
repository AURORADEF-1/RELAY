"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationBadge } from "@/components/notification-badge";

export function PartsControlDropdown({
  badgeCount = 0,
}: {
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isActive = pathname === "/admin" || pathname === "/completed";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative isolate shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition ${
          isActive ? "bg-slate-950 text-white" : "hover:bg-white"
        }`}
      >
        <span>Parts Control</span>
        <NotificationBadge count={badgeCount} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.55rem)] z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.42)]"
        >
          <DropdownLink
            href="/admin"
            label="Parts Control"
            isActive={pathname === "/admin"}
          />
          <DropdownLink
            href="/completed"
            label="Completed Jobs"
            isActive={pathname === "/completed"}
          />
        </div>
      ) : null}
    </div>
  );
}

function DropdownLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
        isActive
          ? "bg-slate-950 text-white"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}
