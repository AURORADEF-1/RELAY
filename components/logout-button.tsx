"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    const supabase = getSupabaseClient();

    if (!supabase) {
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    setIsLoggingOut(false);
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoggingOut ? "Logging Out..." : "Logout"}
    </button>
  );
}
