import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetOverviewDashboard} from '@/components/assets/overview-dashboard';
export default function AssetsPage(){return <AuthGuard><ConsoleShell title="Overview" eyebrow="Fleet & Assets"><AssetOverviewDashboard/></ConsoleShell></AuthGuard>;}
