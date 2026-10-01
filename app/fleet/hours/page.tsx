import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetHours} from '@/components/roam/hours';
export default async function Page({searchParams}:{searchParams:Promise<{machineId?:string}>}){const {machineId}=await searchParams;return <AuthGuard requiredRole="admin"><ConsoleShell title="Asset hours" eyebrow="ROAM meter readings"><AssetHours machineId={machineId}/></ConsoleShell></AuthGuard>}
