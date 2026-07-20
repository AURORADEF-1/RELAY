"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ConsoleShell } from "@/components/console/console-shell";
import { PartsLookupPanel } from "@/components/parts-lookup-panel";

export default function PartsKnowledgePage() {
  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell eyebrow="RELAY intelligence" title="Parts Knowledge">
        <section className="parts-knowledge-overview">
          <div>
            <p>Evidence-led parts intelligence</p>
            <h2>Search learned fitment history and manufacturer catalogue data</h2>
          </div>
          <div className="parts-knowledge-source-key" aria-label="Parts confidence key">
            <span><i className="bg-emerald-500" /> Machine verified</span>
            <span><i className="bg-sky-500" /> Model history</span>
            <span><i className="bg-amber-500" /> Catalogue match</span>
          </div>
        </section>
        <div className="parts-knowledge-console">
          <PartsLookupPanel />
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}
