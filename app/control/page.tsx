"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AdminHealthPanel } from "@/components/admin-health-panel";
import { AdminOperationsOverview } from "@/components/admin-operations-overview";
import { AdminSessionControlPanel } from "@/components/admin-session-control-panel";
import Link from "next/link";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";

export default function ControlPage() {
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();

  return (
    <AuthGuard requiredRole="admin">
      <main className="aurora-shell">
        <div className="aurora-shell-inner max-w-6xl space-y-8">
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
              <Link
                href="/control"
                className="aurora-link aurora-link-active"
              >
                Admin Control
              </Link>
              <Link
                href="/control/operations"
                target="_blank"
                rel="noreferrer"
                className="aurora-link"
              >
                Open Ops View
              </Link>
              <Link
                href="/wallboard"
                target="_blank"
                rel="noreferrer"
                className="aurora-link"
              >
                TV Wallboard
              </Link>
              <ThemeToggleButton />
              <LogoutButton />
            </div>
          </nav>

          <AdminOperationsOverview />
          <AdminHealthPanel />
          <AdminSessionControlPanel />
        </div>
      </main>
    </AuthGuard>
  );
}
