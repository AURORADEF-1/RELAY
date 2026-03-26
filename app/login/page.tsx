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
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#000000_0%,#050505_100%)] px-4 py-5 text-white sm:px-5 sm:py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.025)_0%,rgba(0,0,0,0)_58%)]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(rgba(255,255,255,0.9)_0.6px,transparent_0.6px)] [background-size:5px_5px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.34)_100%)]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[90vw] flex-col justify-center sm:max-w-[29rem]">
        <nav className="mb-10 flex items-center justify-between gap-4">
          <RelayLogo />
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <Link href="/legal" className="rounded-full px-3 py-2 transition hover:bg-white/6 hover:text-white">
              Legal
            </Link>
          </div>
        </nav>

        <section className="mx-auto w-full space-y-9">
          <div className="space-y-8 text-center">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/40">
                Aurora Systems Secure Access
              </p>
            </div>
            <div className="mx-auto flex max-w-[26rem] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/aurora-logo-build.gif"
                alt="Aurora Systems boot sequence"
                className="h-auto w-full object-contain"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.085em] text-white sm:text-[3.35rem]">
                RELAY
              </h1>
              <p className="mx-auto max-w-md text-sm leading-7 text-white/46 sm:text-[0.95rem]">
                Secure operator access for authorised Aurora Systems personnel.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mx-auto w-full space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/34">
                Operator Credentials
              </p>
            </div>

            <label className="block text-sm font-medium text-white/82">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="name@company.local"
                className="mt-2 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/[0.2] focus:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_20px_rgba(255,255,255,0.04)]"
              />
            </label>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/82">
                Password
              </label>
              <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 transition focus-within:border-white/[0.2] focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_20px_rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="min-h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/24"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36 transition hover:text-white/78"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Authenticating..." : "Access Relay"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
