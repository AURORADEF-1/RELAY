"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBadge } from "@/components/notification-badge";

export function PartsControlDropdown({
  badgeCount = 0,
}: {
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === "/admin" || pathname === "/completed";

  return (
    <details className="relative">
      <summary
        className={`list-none cursor-pointer rounded-full px-4 py-2 transition ${
          isActive ? "bg-slate-950 text-white" : "hover:bg-white"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <span>Parts Control</span>
          <NotificationBadge count={badgeCount} />
        </span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.6rem)] z-40 w-64 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_26px_70px_-34px_rgba(15,23,42,0.45)]">
        <DropdownLink
          href="/admin"
          label="Parts Control"
          helper="Open the live workflow dashboard"
          isActive={pathname === "/admin"}
        />
        <DropdownLink
          href="/completed"
          label="Completed Jobs"
          helper="Open the completed archive"
          isActive={pathname === "/completed"}
        />
      </div>
    </details>
  );
}

function DropdownLink({
  href,
  label,
  helper,
  isActive,
}: {
  href: string;
  label: string;
  helper: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl px-4 py-3 transition ${
        isActive ? "bg-slate-950 text-white" : "hover:bg-slate-50"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs leading-5 ${isActive ? "text-slate-300" : "text-slate-500"}`}>
        {helper}
      </p>
    </Link>
  );
}
