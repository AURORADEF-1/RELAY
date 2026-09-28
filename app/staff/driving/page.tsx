import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {DrivingLeague} from '@/components/staff/driving';
export default function DrivingPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Driving league" eyebrow="MLP · staff vehicles"><DrivingLeague/></ConsoleShell></AuthGuard>;}
