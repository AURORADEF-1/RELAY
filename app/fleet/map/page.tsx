import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {TrackingWorkspace} from "@/components/telematics/fleet-workspace";
export default function FleetMapPage(){return <AuthGuard><ConsoleShell title="FLEET MAP" eyebrow="MLP TRACKED FLEET" contentClassName="console-content-fleet-map"><TrackingWorkspace combined/></ConsoleShell></AuthGuard>;}
