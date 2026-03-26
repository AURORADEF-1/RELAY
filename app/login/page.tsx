"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    <main className="login-page text-white">
      <div className="login-content mx-auto flex min-h-screen w-full max-w-[90vw] flex-col justify-center px-4 py-5 sm:max-w-[29rem] sm:px-5 sm:py-6">
        <nav className="mb-8 flex items-center justify-end gap-4 sm:mb-10">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <Link href="/legal" className="rounded-full px-3 py-2 transition hover:bg-white/6 hover:text-white">
              Legal
            </Link>
          </div>
        </nav>

        <section className="mx-auto w-full space-y-8 sm:space-y-9">
          <div className="space-y-6 text-center sm:space-y-8">
            <div className="mx-auto flex max-w-[13rem] items-center justify-center sm:max-w-[15rem] lg:max-w-[16rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/aurora-logo-build.gif"
                alt="Aurora Systems boot sequence"
                className="h-auto w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.085em] text-white sm:text-[3.35rem]">
                RELAY
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mx-auto w-full space-y-4 sm:space-y-5">
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
      <style jsx>{`
        .login-page {
          position: relative;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          background-image: url('/backgrounds/RELAYBACKGROUND.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          background-color: #000000;
        }

        .login-page::before {
          content: "";
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 0;
        }

        .login-page::after {
          content: "";
          position: fixed;
          inset: 0;
          background:
            radial-gradient(circle at center, transparent 48%, rgba(0, 0, 0, 0.26) 100%),
            radial-gradient(rgba(255, 255, 255, 0.85) 0.55px, transparent 0.55px);
          background-size: auto, 5px 5px;
          opacity: 0.045;
          pointer-events: none;
          z-index: 0;
        }

        .login-content {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </main>
  );
}
