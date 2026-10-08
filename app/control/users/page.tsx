"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AdminUserEmailPanel } from "@/components/admin-user-email-panel";
import { ConsoleShell } from "@/components/console/console-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function UsersAccessPage() {
  return <AuthGuard requiredRole="admin"><ConsoleShell eyebrow="RELAY administration" title="Users & Access" contentClassName="console-content-admin">
    <div className="admin-control-page">
      <PageHeader title="Users & Access" description="Review RELAY accounts and manage names, contact details, roles, and interface access from one place." meta={<><span className="relay-live-label"><i /> Live account directory</span><span>Restricted to RELAY administrators</span></>} actions={<Link href="/control" className="relay-button relay-button-secondary">Back to Admin Control</Link>} />
      <nav className="admin-control-subnav" aria-label="Admin control sections"><Link href="/control">Admin Control</Link><Link href="/control/users" aria-current="page">Users & Access</Link></nav>
      <div className="admin-control-workspace"><AdminUserEmailPanel /></div>
    </div>
  </ConsoleShell></AuthGuard>;
}

