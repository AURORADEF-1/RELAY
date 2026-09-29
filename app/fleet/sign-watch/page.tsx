import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {FleetCategories} from "@/components/sign-watch/fleet-categories";
import {SignWatchMap} from "@/components/sign-watch/map";
export default function SignWatchPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Sign Watch" eyebrow="FLEET"><FleetCategories/><SignWatchMap/></ConsoleShell></AuthGuard>;}
