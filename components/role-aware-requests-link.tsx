"use client";

import Link from "next/link";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";

export function RoleAwareRequestsLink({
  className,
  userLabel = "My Requests",
  adminLabel = "Smart Search",
  showBadge = true,
}: {
  className: string;
  userLabel?: string;
  adminLabel?: string;
  showBadge?: boolean;
}) {
  const { isAdmin, requesterUnreadCount, adminBadgeCount } = useNotifications();

  return (
    <Link href={isAdmin ? "/admin?tab=search" : "/requests"} className={className}>
      {isAdmin ? adminLabel : userLabel}
      {showBadge ? (
        <NotificationBadge count={isAdmin ? adminBadgeCount : requesterUnreadCount} />
      ) : null}
    </Link>
  );
}
