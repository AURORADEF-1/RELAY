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
