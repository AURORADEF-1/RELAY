"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AdminOperationsOverview } from "@/components/admin-operations-overview";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBadge } from "@/components/notification-badge";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { useNotifications } from "@/components/notification-provider";

export default function OperationsOverviewPage() {
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();

  return (
    <AuthGuard requiredRole="admin">
      <main className="aurora-shell">
        <div className="aurora-shell-inner max-w-7xl space-y-8">
          <nav className="aurora-nav">
            <RelayLogo />
            <div className="aurora-nav-links text-sm font-medium">
              <Link href="/" className="aurora-link">
                Home
              </Link>
              <Link href="/admin?tab=search" className="aurora-link">
                Smart Search
                <NotificationBadge count={requesterUnreadCount} />
              </Link>
              <Link href="/incidents" className="aurora-link">
                Workshop Control
              </Link>
              <Link href="/admin" className="aurora-link">
                Parts Control
                <NotificationBadge count={adminBadgeCount} />
              </Link>
              <Link href="/control" className="aurora-link">
                Admin Control
              </Link>
              <Link
                href="/control/operations"
                className="aurora-link aurora-link-active"
              >
                Ops Overview
              </Link>
              <ThemeToggleButton />
              <LogoutButton />
            </div>
          </nav>

          <AdminOperationsOverview />
        </div>
      </main>
    </AuthGuard>
  );
}
