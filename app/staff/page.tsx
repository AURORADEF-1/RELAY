import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {StaffWorkspace} from '@/components/staff/workspace';
export default function StaffPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Staff" eyebrow="MLP · yard presence"><StaffWorkspace/></ConsoleShell></AuthGuard>;}
