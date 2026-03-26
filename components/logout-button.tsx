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
      className="aurora-button-secondary rounded-full disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoggingOut ? "Logging Out..." : "Logout"}
    </button>
  );
}
