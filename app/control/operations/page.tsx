"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AdminOperationsOverview } from "@/components/admin-operations-overview";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBadge } from "@/components/notification-badge";
import { RelayLogo } from "@/components/relay-logo";
import { useNotifications } from "@/components/notification-provider";

export default function OperationsOverviewPage() {
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();

  return (
    <AuthGuard requiredRole="admin">
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
        <div className="mx-auto max-w-7xl space-y-8">
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
              <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">
                Admin Control
              </Link>
              <Link
                href="/control/operations"
                className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
              >
                Ops Overview
              </Link>
              <LogoutButton />
            </div>
          </nav>

          <AdminOperationsOverview standalone />
        </div>
      </main>
    </AuthGuard>
  );
}
