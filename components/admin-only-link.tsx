"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type AdminOnlyLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export function AdminOnlyLink({
  href,
  className,
  children,
}: AdminOnlyLinkProps) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminRole() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        if (isMounted) {
          setIsAdmin(false);
        }
        return;
      }

      try {
        const { isAdmin } = await getCurrentUserWithRole(supabase);

        if (isMounted) {
          setIsAdmin(isAdmin);
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
        }
      }
    }

    checkAdminRole();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
