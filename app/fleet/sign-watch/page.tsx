import {AuthGuard} from "@/components/auth-guard";
import {ConsoleShell} from "@/components/console/console-shell";
import {FleetCategories} from "@/components/sign-watch/fleet-categories";
import {SignWatchFleetCard} from "@/components/sign-watch/fleet-card";
import {SignWatchAlerts} from "@/components/sign-watch/alerts";
export default function SignWatchPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Sign Watch" eyebrow="FLEET"><FleetCategories/><SignWatchFleetCard/><SignWatchAlerts/></ConsoleShell></AuthGuard>;}
