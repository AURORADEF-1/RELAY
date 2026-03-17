"use client";

import Link from "next/link";

type WorkshopIncidentsTab = "dashboard" | "damage" | "tyres";

const tabs: Array<{
  key: WorkshopIncidentsTab;
  label: string;
  href: string;
}> = [
  { key: "dashboard", label: "Incident Dashboard", href: "/incidents" },
  { key: "damage", label: "Report Damage", href: "/incidents/damage/new" },
  { key: "tyres", label: "Report Tyre Breakdown", href: "/incidents/tyres/new" },
];

export function WorkshopIncidentsTabs({
  activeTab,
}: {
  activeTab: WorkshopIncidentsTab;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-slate-950 text-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.65)]"
                : "text-slate-600 hover:bg-white hover:text-slate-950"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
