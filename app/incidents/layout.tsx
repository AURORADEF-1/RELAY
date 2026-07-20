"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
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
        contentClassName="console-content-workshop"
      >
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
