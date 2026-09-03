"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ConsoleShell } from "@/components/console/console-shell";
import { FilterLookupWorkspace } from "@/components/rico/filter-lookup-workspace";

export default function FilterLookupPage() {
  return (
    <AuthGuard>
      <ConsoleShell
        eyebrow="RELAY parts intelligence"
        title="Filter Lookup"
        contentClassName="console-content-filters"
      >
        <FilterLookupWorkspace />
      </ConsoleShell>
    </AuthGuard>
  );
}
