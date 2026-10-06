import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {TripHistoryWorkspace} from '@/components/trip-history/workspace';

export default function FleetTripsPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="TRIP HISTORY" eyebrow="ASSETCARE+ ASSETS"><TripHistoryWorkspace/></ConsoleShell></AuthGuard>;}
