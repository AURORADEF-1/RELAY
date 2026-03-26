"use client";

export function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full border border-white/20 bg-[var(--danger)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)]">
      {count > 99 ? "99+" : count}
    </span>
  );
}
