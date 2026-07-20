"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ConsoleShell } from "@/components/console/console-shell";
import { PartsLookupPanel } from "@/components/parts-lookup-panel";

export default function PartsKnowledgePage() {
  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell eyebrow="RELAY intelligence" title="Parts Knowledge">
        <div className="parts-knowledge-console">
          <PartsLookupPanel />
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}
