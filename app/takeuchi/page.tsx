import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {TrackingWorkspace} from "@/components/telematics/fleet-workspace";
export default function TakeuchiPage(){return <AuthGuard><ConsoleShell title="Takeuchi Track" eyebrow="Fleet position and condition"><TrackingWorkspace provider="takeuchi"/></ConsoleShell></AuthGuard>;}
