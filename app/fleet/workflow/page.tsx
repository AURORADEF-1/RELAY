import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {FleetWorkflow} from '@/components/fleet-workflow/workspace';
export default function FleetWorkflowPage(){return <AuthGuard><ConsoleShell title="Return to hire" eyebrow="Fleet clearance"><FleetWorkflow/></ConsoleShell></AuthGuard>}
