"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AdminHealthPanel } from "@/components/admin-health-panel";
import { AdminSessionControlPanel } from "@/components/admin-session-control-panel";
import Link from "next/link";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";

export default function ControlPage() {
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();

  return (
    <AuthGuard requiredRole="admin">
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
            <RelayLogo />
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
              <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
                Home
              </Link>
              <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
                My Requests
                <NotificationBadge count={requesterUnreadCount} />
              </Link>
              <Link href="/incidents" className="rounded-full px-4 py-2 hover:bg-white">
                Workshop Control
              </Link>
              <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                Parts Control
                <NotificationBadge count={adminBadgeCount} />
              </Link>
              <Link
                href="/control"
                className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
              >
                Admin Control
              </Link>
              <LogoutButton />
            </div>
          </nav>

          <AdminHealthPanel />
          <AdminSessionControlPanel />
        </div>
      </main>
    </AuthGuard>
  );
}
