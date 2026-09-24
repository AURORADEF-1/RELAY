import { AuthGuard } from "@/components/auth-guard";
import { ConsoleShell } from "@/components/console/console-shell";
import { LiveLinkWorkspace } from "@/components/jcb/livelink-workspace";
import "./style.css";

export default function LiveLinkPage() {
  return <AuthGuard><ConsoleShell title="JCB LiveLink" eyebrow="Fleet position and condition"><LiveLinkWorkspace /></ConsoleShell></AuthGuard>;
}
