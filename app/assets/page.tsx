import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetSearch} from '@/components/assets/workspace';
import {AssetOverviewDashboard} from '@/components/assets/overview-dashboard';
export default function AssetsPage(){return <AuthGuard><ConsoleShell title="Overview" eyebrow="Fleet & Assets"><AssetOverviewDashboard/><AssetSearch/></ConsoleShell></AuthGuard>;}
