import {AuthGuard} from '@/components/auth-guard';
import {ConsoleShell} from '@/components/console/console-shell';
import {AssetInbox} from '@/components/assets/inbox';
export default function InboxPage(){return <AuthGuard requiredRole="admin"><ConsoleShell title="Asset Inbox" eyebrow="Fleet updates"><AssetInbox/></ConsoleShell></AuthGuard>;}
