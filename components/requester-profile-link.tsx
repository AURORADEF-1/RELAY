"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { requesterProfileHref } from "@/lib/requester-profile-route";

export function RequesterProfileLink({
  userId,
  requesterName,
  className = "",
  enabled = true,
  stopPropagation = false,
}: {
  userId: string | null | undefined;
  requesterName: string | null | undefined;
  className?: string;
  enabled?: boolean;
  stopPropagation?: boolean;
}) {
  const label = requesterName?.trim();
  if (!label) {
    return <span className={className}>—</span>;
  }

  if (!enabled) {
    return <span className={className}>{label}</span>;
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (stopPropagation) {
      event.stopPropagation();
    }
  }

  return (
    <Link
      href={requesterProfileHref({ userId, requesterName })}
      className={`requester-profile-link ${className}`.trim()}
      aria-label={`Open requester profile for ${label}`}
      title={`Open ${label}'s requester profile`}
      onClick={handleClick}
    >
      {label}
    </Link>
  );
}
