"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { recordAdminHealthEvent } from "@/lib/admin-health";
import { isLocalDemoMode, isLocalRolePreviewEnabled } from "@/lib/demo-mode";
import {
  clearCurrentUserWithRoleCache,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import { accessGroupHome, canAccessPath } from "@/lib/access-groups";
import "./auth-guard.css";

export function AuthGuard({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: "admin" | "front-counter" | "admin-or-front-counter";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      if (isLocalDemoMode) {
        setIsChecking(false);
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        if (!isMounted) {
          return;
        }

        setErrorMessage("Supabase environment variables are not configured.");
        recordAdminHealthEvent("auth", "Supabase environment variables are not configured.");
        setIsChecking(false);
        return;
      }

      try {
        const { user, isAdmin, isFrontCounter, accessGroup } = await getCurrentUserWithRole(supabase, {
          forceFresh: true,
        });

        if (!isMounted) {
          return;
        }

        if (!user) {
          clearCurrentUserWithRoleCache();
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        const previewRole = isLocalRolePreviewEnabled
          ? window.localStorage.getItem("relay-demo-access-view")
          : null;
        const effectiveIsAdmin = previewRole
          ? previewRole === "admin"
          : isAdmin;
        const effectiveIsFrontCounter = previewRole
          ? previewRole === "front-counter"
          : isFrontCounter;

        if (!previewRole && accessGroup && !canAccessPath(accessGroup, pathname)) {
          router.replace(accessGroupHome(accessGroup));
          return;
        }

        const groupControlsRoute = !previewRole && accessGroup !== null && accessGroup !== "admin";

        if (!groupControlsRoute && requiredRole === "admin" && !effectiveIsAdmin) {
          router.replace("/");
          return;
        }

        if (!groupControlsRoute && requiredRole === "front-counter" && !effectiveIsFrontCounter) {
          router.replace(effectiveIsAdmin ? "/console" : "/requests");
          return;
        }

        if (
          !groupControlsRoute && requiredRole === "admin-or-front-counter" &&
          !effectiveIsAdmin &&
          !effectiveIsFrontCounter
        ) {
          router.replace("/requests");
          return;
        }

        setIsChecking(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to verify access.",
        );
        recordAdminHealthEvent("auth", "Failed to verify admin access.");
        setIsChecking(false);
        return;
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [pathname, requiredRole, router]);

  if (errorMessage) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
        {errorMessage}
      </div>
    );
  }

  if (isChecking) {
    return (
      <section className="auth-session-loading" role="status" aria-live="polite" aria-label="Opening AssetCare Plus">
        <div className="auth-session-loading__brand">
          <Image src="/assetcare-plus-logo.png" alt="AssetCare+" width={300} height={72} priority />
          <span>RELAY OPERATIONS</span>
        </div>
        <div className="auth-session-loading__track" aria-hidden="true"><span /></div>
        <p>Opening your workspace…</p>
      </section>
    );
  }

  return <>{children}</>;
}
