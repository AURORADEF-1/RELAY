"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RelayLogo } from "@/components/relay-logo";
import { sanitizeAuthError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      setErrorMessage(sanitizeAuthError(error));
      setIsSubmitting(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(79,94,117,0.18)_0%,rgba(8,11,16,0)_26%),linear-gradient(180deg,#04060a_0%,#06090d_42%,#04060a_100%)] px-6 py-8 text-slate-100 sm:py-10">
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.38),transparent_85%)]" />
      </div>

      <div className="relative mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <RelayLogo />
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <Link href="/legal" className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white">
              Legal
            </Link>
          </div>
        </nav>

        <section className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,21,30,0.88)_0%,rgba(8,12,18,0.96)_100%)] p-8 shadow-[0_42px_120px_-52px_rgba(0,0,0,0.86)] backdrop-blur-2xl sm:p-10">
          <div className="mx-auto max-w-2xl space-y-10">
            <div className="space-y-7 text-center">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                  Aurora Systems Secure Access
                </p>
                <h1 className="text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl">
                  RELAY Admin Access
                </h1>
                <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
                  System boot interface for authorised operational users. Secure sign-in is required to access command functions and live workflows.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08)_0%,rgba(9,12,18,0.86)_68%)] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_28px_80px_-48px_rgba(0,0,0,0.92)]">
                <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.9),rgba(255,255,255,0))]" />
                <div className="mx-auto flex max-w-[28rem] items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/aurora-logo-build.gif"
                    alt="Aurora Systems boot sequence"
                    className="h-auto w-full max-w-[26rem] object-contain"
                  />
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    Command Platform
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    Secure Boot
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    Aurora Systems
                  </span>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7"
            >
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Operator Credentials
                </p>
                <p className="text-sm leading-6 text-slate-400">
                  Authenticate with your Aurora-linked RELAY account.
                </p>
              </div>

              <label className="block text-sm font-medium text-slate-200">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="name@company.local"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:bg-white/[0.08]"
                />
              </label>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 transition focus-within:border-white/20 focus-within:bg-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="min-h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-13 w-full items-center justify-center rounded-2xl border border-white/10 bg-white px-5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Authenticating..." : "Access Relay"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
