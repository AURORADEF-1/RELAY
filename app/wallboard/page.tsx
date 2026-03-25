"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";

export default function WallboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <AuthGuard requiredRole="admin">
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#111827_45%,#020617_100%)]" />
    </AuthGuard>
  );
}
