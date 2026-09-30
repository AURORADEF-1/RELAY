import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {RoamHires} from '@/components/roam/hires';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 return <AuthGuard requiredRole="admin"><ConsoleShell title="ROAM hire pack" eyebrow="Current hire information"><RoamHires key={id} hireId={id}/></ConsoleShell></AuthGuard>;
}
