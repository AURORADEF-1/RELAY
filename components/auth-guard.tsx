"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { recordAdminHealthEvent } from "@/lib/admin-health";
import {
  clearCurrentUserWithRoleCache,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

export function AuthGuard({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: "admin";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
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
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
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

        if (requiredRole === "admin" && !isAdmin) {
          router.replace("/");
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
      <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.2)]">
        Checking session...
      </div>
    );
  }

  return <>{children}</>;
}
