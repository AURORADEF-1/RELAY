import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetSearch} from '@/components/assets/workspace';
export default function AssetsPage(){return <AuthGuard><ConsoleShell title="Asset Search" eyebrow="MLP assets"><AssetSearch/></ConsoleShell></AuthGuard>;}
