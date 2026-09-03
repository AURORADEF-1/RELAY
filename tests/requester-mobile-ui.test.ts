import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("RELAY fitter mobile workspace", () => {
  it("keeps the completed archive and Front Counter controls in admin navigation", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "components/console/console-shell.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(shell).toContain('href: "/completed"');
    expect(shell).toContain('label: "Completed Jobs"');
    expect(shell).toContain('href: "/front-counter"');
    expect(shell).toContain('label: "Front Counter"');
    expect(shell).toContain('href: "/terminal"');
    expect(shell).toContain("frontCounterOnly: true");
    expect(shell).toContain("return item.frontCounterOnly");
    expect(styles).toContain(".completed-overview-strip");
    expect(styles).toContain(".completed-workspace");
    expect(styles).toContain(".completed-table th");
    expect(styles).toContain("top: 0;");
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

  it("keeps New Request in the operational console without losing intake tools", () => {
    const submit = readFileSync(
      resolve(process.cwd(), "app/submit/page.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(submit).toContain("<ConsoleShell");
    expect(submit).toContain('title="New request"');
    expect(submit).toContain('aria-label="Request intake summary"');
    expect(submit).toContain("<QrMachineReferenceScanner");
    expect(submit).toContain("<FileUploadPanel");
    expect(submit).toContain("isOnline");
    expect(submit).toContain('"Submit Request"');
    expect(submit).toContain('"Save Request Locally"');
    expect(styles).toContain(".new-request-status-strip");
    expect(styles).toContain(".new-request-form-panel");
  });

  it("gives requester accounts Filter Lookup and Settings without ticket-write access", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "components/console/console-shell.tsx"),
      "utf8",
    );
    const filtersPage = readFileSync(
      resolve(process.cwd(), "app/filters/page.tsx"),
      "utf8",
    );
    const filterWorkspace = readFileSync(
      resolve(process.cwd(), "components/rico/filter-lookup-workspace.tsx"),
      "utf8",
    );
    const ticketPartsRoute = readFileSync(
      resolve(process.cwd(), "app/api/integrations/rico/ticket-parts/route.ts"),
      "utf8",
    );

    expect(shell).toContain('{ href: "/filters", label: "Filter Lookup", icon: "filter" }');
    expect(shell).toContain('{ href: "/settings", label: "Settings", icon: "settings" }');
    expect(filtersPage).toContain("<AuthGuard>");
    expect(filtersPage).not.toContain('requiredRole="admin"');
    expect(filterWorkspace).toContain("onTicket={isAdmin ?");
    expect(ticketPartsRoute).toContain("authorizeRicoRoute(request)");
  });
});
