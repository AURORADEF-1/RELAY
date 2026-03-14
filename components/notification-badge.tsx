"use client";

export function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
