import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {RoamHires} from '@/components/roam/hires';
export default function Page(){return <AuthGuard requiredRole="admin"><ConsoleShell title="ROAM hires" eyebrow="Current hire information"><RoamHires/></ConsoleShell></AuthGuard>}
