"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ConsoleShell } from "@/components/console/console-shell";
import { NexusStoresWorkspace } from "@/components/nexus/nexus-stores-workspace";

export default function StoresSelfServicePage() {
  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        eyebrow="RELAY × NEXUS"
        title="Stores Self-Service"
        contentClassName="console-content-filters"
      >
        <NexusStoresWorkspace />
      </ConsoleShell>
    </AuthGuard>
  );
}
