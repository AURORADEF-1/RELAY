import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetDetail} from '@/components/assets/workspace';
export default async function AssetPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AuthGuard><ConsoleShell title="Machine record" eyebrow="MLP assets"><AssetDetail key={id} id={id}/></ConsoleShell></AuthGuard>;}
