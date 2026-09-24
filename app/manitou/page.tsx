import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {TrackingWorkspace} from "@/components/telematics/fleet-workspace";
export default function ManitouPage(){return <AuthGuard><ConsoleShell title="Manitou Track" eyebrow="Fleet position and condition"><TrackingWorkspace/></ConsoleShell></AuthGuard>;}
