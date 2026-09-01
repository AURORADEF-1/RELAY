"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CupsPrintStation } from "@/components/cups-print-station";
import { DymoPrintStation } from "@/components/dymo-print-station";
import { GlobalTicketChat } from "@/components/global-ticket-chat";
import { LegalTermsGate } from "@/components/legal-terms-gate";
import { NotificationToasts } from "@/components/notification-toasts";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

const FRONT_COUNTER_ROUTES = ["/terminal", "/wallboard", "/submit", "/login", "/legal"];

export function AppRuntime({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isFrontCounter, setIsFrontCounter] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      const timeout = window.setTimeout(() => setIsResolved(true), 0);
      return () => window.clearTimeout(timeout);
    }

    void getCurrentUserWithRole(supabase, { forceFresh: true })
      .then(({ isFrontCounter: nextIsFrontCounter }) => {
        if (!mounted) return;
        setIsFrontCounter(nextIsFrontCounter);
        setIsResolved(true);
        if (
          nextIsFrontCounter
          && !FRONT_COUNTER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
        ) {
          router.replace("/terminal");
        }
      })
      .catch(() => setIsResolved(true));

    return () => { mounted = false; };
  }, [pathname, router]);

  const routeAllowed = !isFrontCounter || FRONT_COUNTER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    <>
      <LegalTermsGate />
      {isResolved && isFrontCounter ? <CupsPrintStation /> : <DymoPrintStation />}
      <NotificationToasts />
      {!isFrontCounter ? <GlobalTicketChat /> : null}
      {routeAllowed ? children : (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Opening Front Counter…</p>
        </main>
      )}
    </>
  );
}
