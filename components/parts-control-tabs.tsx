"use client";

import Link from "next/link";

type PartsControlTab = "operations" | "completed" | "guide" | "faq";

const tabs: Array<{
  key: PartsControlTab;
  label: string;
  href: string;
}> = [
  { key: "operations", label: "Operations", href: "/admin" },
  { key: "completed", label: "Completed Jobs", href: "/completed" },
  { key: "guide", label: "User Guide", href: "/admin?tab=guide" },
  { key: "faq", label: "FAQ", href: "/admin?tab=faq" },
];

export function PartsControlTabs({
  activeTab,
}: {
  activeTab: PartsControlTab;
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
