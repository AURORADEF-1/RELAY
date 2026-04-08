"use client";

import Link from "next/link";

type PartsControlTab = "operations" | "orders" | "completed" | "guide" | "faq";
type PartsControlInlineTab = Exclude<PartsControlTab, "completed">;

const tabs: Array<{
  key: PartsControlTab;
  label: string;
  href: string;
}> = [
  { key: "operations", label: "Operations", href: "/admin" },
  { key: "orders", label: "Orders", href: "/admin?tab=orders" },
  { key: "completed", label: "Completed Jobs", href: "/completed" },
  { key: "guide", label: "User Guide", href: "/admin?tab=guide" },
  { key: "faq", label: "FAQ", href: "/admin?tab=faq" },
];

export function PartsControlTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: PartsControlTab;
  onTabChange?: (tab: PartsControlInlineTab) => void;
}) {
  return (
    <div className="aurora-pill-group w-full">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            onClick={() => {
              if (tab.key !== "completed") {
                onTabChange?.(tab.key);
              }
            }}
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
