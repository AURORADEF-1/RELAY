import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Parts Control overdue reminders", () => {
  it("does not open the overdue modal automatically", () => {
    const page = readFileSync(resolve(process.cwd(), "app/admin/page.tsx"), "utf8");
    expect(page).toContain("isOverdueReminderOpen && overdueOrderedTickets.length > 0");
    expect(page).toContain("Review overdue orders");
    expect(page).toContain("setIsOverdueReminderOpen(true)");
  });

  it("keeps the reminder list bounded and explicitly closeable", () => {
    const modal = readFileSync(
      resolve(process.cwd(), "components/overdue-ordered-reminders-modal.tsx"),
      "utf8",
    );
    expect(modal).toContain("onClose: () => void");
    expect(modal).toContain("max-h-[min(52rem,calc(100vh-3rem))]");
    expect(modal).toContain("overflow-y-auto");
  });
});
