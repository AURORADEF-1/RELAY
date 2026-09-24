import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {OperationsWorkspace} from '@/components/fleet-operations/workspace';
export default function FleetOperationsPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Fleet Operations" eyebrow="MLP tracked fleet"><OperationsWorkspace/></ConsoleShell></AuthGuard>;}
