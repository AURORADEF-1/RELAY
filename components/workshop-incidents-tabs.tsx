"use client";

import Link from "next/link";

type WorkshopIncidentsTab =
  | "dashboard"
  | "map"
  | "tasks"
  | "completedTasks"
  | "closed"
  | "damage"
  | "tyres";

const tabs: Array<{
  key: WorkshopIncidentsTab;
  label: string;
  href: string;
}> = [
  { key: "dashboard", label: "Workshop Control", href: "/incidents" },
  { key: "map", label: "Onsite Map", href: "/incidents/map" },
  { key: "tasks", label: "Tasks", href: "/incidents/tasks" },
  { key: "completedTasks", label: "Completed Tasks", href: "/incidents/tasks/completed" },
  { key: "closed", label: "Closed Jobs", href: "/incidents/closed" },
  { key: "damage", label: "Report Damage", href: "/incidents/damage/new" },
  { key: "tyres", label: "Report Tyre Breakdown", href: "/incidents/tyres/new" },
];

export function WorkshopIncidentsTabs({
  activeTab,
}: {
  activeTab: WorkshopIncidentsTab;
}) {
  return (
    <div className="aurora-pill-group w-full">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`aurora-pill ${
              activeTab === tab.key
                ? "aurora-pill-active"
                : ""
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
