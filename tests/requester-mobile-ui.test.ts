import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("RELAY fitter mobile workspace", () => {
  it("keeps the completed archive and Front Counter controls in admin navigation", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "components/console/console-shell.tsx"),
      "utf8",
    );

    expect(shell).toContain('href: "/completed"');
    expect(shell).toContain('label: "Completed Jobs"');
    expect(shell).toContain('href: "/front-counter"');
    expect(shell).toContain('label: "Front Counter"');
  });

  it("keeps navigation labels visible and provides a mobile logout action", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "components/console/console-shell.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(shell).toContain("compact={isCollapsed && !isMobileOpen}");
    expect(shell).toContain('className="console-mobile-sidebar-actions"');
    expect(shell).toContain("<LogoutButton />");
    expect(styles).toContain(
      ".console-shell-collapsed .console-sidebar .console-nav-label",
    );
    expect(styles).toContain(".console-mobile-sidebar-actions {");
  });

  it("gives fitters a compact status rail and a clear new-request action", () => {
    const requests = readFileSync(
      resolve(process.cwd(), "app/requests/page.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(requests).toContain('href="/submit"');
    expect(requests).toContain("New parts request");
    expect(requests).toContain('aria-label="Request status summary"');
    expect(styles).toContain("scroll-snap-type: inline proximity");
  });
});
