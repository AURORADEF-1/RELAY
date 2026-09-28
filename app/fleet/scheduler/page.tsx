import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {FleetScheduler} from '@/components/fleet-scheduler/workspace';
export default function SchedulerPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Fleet Scheduler" eyebrow="AssetCare+ fleet planning"><FleetScheduler/></ConsoleShell></AuthGuard>;}
