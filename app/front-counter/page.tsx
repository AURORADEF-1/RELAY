"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { FrontCounterControlPanel } from "@/components/front-counter-control-panel";
import { PageHeader } from "@/components/layout/page-header";

export default function FrontCounterControlPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        eyebrow="RELAY administration"
        title="Front Counter"
        contentClassName="console-content-admin"
      >
        <div className="admin-control-page">
          <PageHeader
            title="Front Counter"
            description="Monitor and safely maintain the Raspberry Pi, dual RELAY displays and CUPS label station."
            meta={
              <>
                <span className="relay-live-label">
                  <i /> Live device connection
                </span>
                <span>Restricted to RELAY administrators</span>
              </>
            }
            actions={
              <>
                <Link
                  href="/terminal"
                  target="_blank"
                  rel="noreferrer"
                  className="relay-button relay-button-secondary"
                >
                  <ConsoleIcon name="console" className="h-4 w-4" />
                  Open terminal view
                </Link>
                <Link
                  href="/wallboard"
                  target="_blank"
                  rel="noreferrer"
                  className="relay-button relay-button-primary"
                >
                  <ConsoleIcon name="wallboard" className="h-4 w-4" />
                  Open wallboard
                </Link>
              </>
            }
          />
          <FrontCounterControlPanel />
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}
