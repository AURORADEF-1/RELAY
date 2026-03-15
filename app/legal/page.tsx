import Link from "next/link";
import { RelayLogo } from "@/components/relay-logo";
import { RELAY_TERMS_VERSION, relayDataProtectionClause, relayTermsBullets } from "@/lib/legal";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/login" className="rounded-full px-4 py-2 hover:bg-white">
              Login
            </Link>
          </div>
        </nav>

        <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
          <div className="max-w-4xl space-y-8">
            <div className="space-y-4">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Legal Help
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                RELAY Terms and Data Protection
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Operational use of RELAY is subject to the current terms version{" "}
                <span className="font-semibold text-slate-800">
                  {RELAY_TERMS_VERSION}
                </span>
                .
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Terms of Use
                </p>
                <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
                  {relayTermsBullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Data Protection Clause
                </p>
                <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                  {relayDataProtectionClause.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
