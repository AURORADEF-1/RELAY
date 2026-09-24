import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {TrackingWorkspace} from "@/components/telematics/fleet-workspace";
export default function FleetMapPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Fleet map" eyebrow="JCB and Manitou"><TrackingWorkspace combined/></ConsoleShell></AuthGuard>;}
