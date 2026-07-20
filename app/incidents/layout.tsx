"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";

type WorkshopTab = Parameters<typeof WorkshopIncidentsTabs>[0]["activeTab"];

export default function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTab = getWorkshopTab(pathname);

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        eyebrow="RELAY workshop"
        title={getWorkshopTitle(pathname)}
        actions={
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/incidents/damage/new" className="console-command-action">
              <ConsoleIcon name="file" className="h-4 w-4" />
              <span>Report damage</span>
            </Link>
            <Link href="/incidents/tyres/new" className="console-command-action">
              <ConsoleIcon name="activity" className="h-4 w-4" />
              <span>Tyre breakdown</span>
            </Link>
          </div>
        }
      >
        <section className="workshop-console-overview">
          <div>
            <p>Workshop command centre</p>
            <h2>Incidents, onsite jobs, tasks, and reporting</h2>
          </div>
          <span className="workshop-console-live">
            <span /> Live operational data
          </span>
        </section>

        <div className="workshop-console-tabs">
          <WorkshopIncidentsTabs activeTab={activeTab} />
        </div>

        <div className="workshop-shell-content">{children}</div>
      </ConsoleShell>
    </AuthGuard>
  );
}

function getWorkshopTab(pathname: string): WorkshopTab {
  if (pathname === "/incidents/map") return "map";
  if (pathname === "/incidents/tasks/completed") return "completedTasks";
  if (pathname === "/incidents/tasks") return "tasks";
  if (pathname === "/incidents/closed") return "closed";
  if (pathname === "/incidents/damage/new") return "damage";
  if (pathname === "/incidents/tyres/new") return "tyres";
  return "dashboard";
}

function getWorkshopTitle(pathname: string) {
  if (pathname === "/incidents/map") return "Onsite map";
  if (pathname === "/incidents/tasks/completed") return "Completed tasks";
  if (pathname === "/incidents/tasks") return "Workshop tasks";
  if (pathname === "/incidents/closed") return "Closed workshop jobs";
  if (pathname === "/incidents/damage/new") return "Report damage";
  if (pathname === "/incidents/tyres/new") return "Report tyre breakdown";
  if (pathname !== "/incidents") return "Incident detail";
  return "Workshop control";
}
