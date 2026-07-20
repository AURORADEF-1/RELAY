"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AdminHealthPanel } from "@/components/admin-health-panel";
import { AdminOperatorManagementPanel } from "@/components/admin-operator-management-panel";
import { AdminOperationsOverview } from "@/components/admin-operations-overview";
import { AdminSessionControlPanel } from "@/components/admin-session-control-panel";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { PageHeader } from "@/components/layout/page-header";

const controlSections = [
  { href: "#overview", label: "Operations overview" },
  { href: "#operators", label: "Operator names" },
  { href: "#health", label: "System health" },
  { href: "#sessions", label: "Session tools" },
];

export default function ControlPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        eyebrow="RELAY administration"
        title="Admin control"
        contentClassName="console-content-admin"
      >
        <div className="admin-control-page">
          <PageHeader
            title="Admin Control"
            description="Monitor operational health, maintain operator reporting, and manage active RELAY sessions from one administrative workspace."
            meta={
              <>
                <span className="relay-live-label"><i /> Live administration data</span>
                <span>Restricted to RELAY administrators</span>
              </>
            }
            actions={
              <>
                <Link href="/control/operations" target="_blank" rel="noreferrer" className="relay-button relay-button-secondary">
                  <ConsoleIcon name="activity" className="h-4 w-4" />
                  Open operations view
                </Link>
                <Link href="/wallboard" target="_blank" rel="noreferrer" className="relay-button relay-button-primary">
                  <ConsoleIcon name="wallboard" className="h-4 w-4" />
                  TV wallboard
                </Link>
              </>
            }
          />

          <nav className="admin-control-subnav" aria-label="Admin control sections">
            {controlSections.map((section) => (
              <a key={section.href} href={section.href}>
                {section.label}
              </a>
            ))}
          </nav>

          <div className="admin-control-workspace">
            <div id="overview" className="admin-control-section-anchor">
              <AdminOperationsOverview />
            </div>

            <div className="admin-control-support-grid">
              <div id="operators" className="admin-control-section-anchor">
                <AdminOperatorManagementPanel />
              </div>
              <div id="health" className="admin-control-section-anchor">
                <AdminHealthPanel />
              </div>
            </div>

            <div id="sessions" className="admin-control-section-anchor">
              <AdminSessionControlPanel />
            </div>
          </div>
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}
