"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { RelayLogo } from "@/components/relay-logo";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { requesterUnreadCount } = useNotifications();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextPath, setNextPath] = useState("/requests");

  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      const supabase = getSupabaseClient();
      const nextValue = new URLSearchParams(window.location.search).get("next");

      if (nextValue) {
        setNextPath(nextValue);
      }

      if (!supabase) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (isMounted && session) {
        router.replace(nextValue || "/requests");
      }
    }

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
          </div>
        </nav>

        <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
          <div className="mx-auto max-w-md space-y-10">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Secure Access
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
                Login
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Sign in with your RELAY account to view and manage parts
                requests.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6"
            >
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>

              {errorMessage ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Signing In..." : "Sign In"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
