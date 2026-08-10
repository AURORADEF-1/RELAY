"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase";

type GateState = "checking" | "denied" | "enrol" | "challenge" | "ready" | "error";

export function OversightAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function initialise() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setMessage("RELAY authentication is not configured.");
        setState("error");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        window.location.href = `/login?next=${encodeURIComponent("/oversight")}`;
        return;
      }

      const { data: access } = await supabase
        .from("oversight_access")
        .select("enabled")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .maybeSingle();

      if (!active) return;
      if (!access) {
        setState("denied");
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        setState("ready");
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = factors?.totp?.find((factor) => factor.status === "verified");
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setState("challenge");
        return;
      }

      const { data: enrollment, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "RELAY Oversight",
      });
      if (error || !enrollment) throw error ?? new Error("Unable to start two-factor setup.");
      setFactorId(enrollment.id);
      setQrCode(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      setState("enrol");
    }

    initialise().catch((error) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Unable to verify Oversight access.");
      setState("error");
    });

    return () => {
      active = false;
    };
  }, []);

  async function verifyCode() {
    const supabase = getSupabaseClient();
    if (!supabase || !factorId || code.trim().length !== 6) return;

    setBusy(true);
    setMessage("");
    try {
      let currentChallengeId = challengeId;
      if (!currentChallengeId) {
        const { data, error } = await supabase.auth.mfa.challenge({ factorId });
        if (error || !data) throw error ?? new Error("Unable to start verification.");
        currentChallengeId = data.id;
        setChallengeId(data.id);
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: currentChallengeId,
        code: code.trim(),
      });
      if (error) throw error;
      setState("ready");
    } catch (error) {
      setChallengeId("");
      setMessage(error instanceof Error ? error.message : "That code was not accepted.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "ready") return <>{children}</>;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
      <section className="mx-auto max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">RELAY Oversight</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          {state === "denied" ? "Restricted access" : "Secure verification"}
        </h1>

        {state === "checking" ? <p className="mt-4 text-slate-300">Checking your secure access…</p> : null}
        {state === "denied" ? (
          <p className="mt-4 leading-7 text-slate-300">
            Your account is not approved for Oversight. Ask a RELAY administrator to add your account.
          </p>
        ) : null}
        {state === "error" ? <p className="mt-4 text-rose-300">{message}</p> : null}

        {state === "enrol" ? (
          <div className="mt-6 space-y-5">
            <p className="leading-7 text-slate-300">
              Scan this code with Microsoft Authenticator, Google Authenticator or another authenticator app.
            </p>
            {qrCode ? <Image src={qrCode} alt="RELAY Oversight authenticator QR code" width={208} height={208} unoptimized className="mx-auto h-52 w-52 rounded-2xl bg-white p-3" /> : null}
            <details className="rounded-xl bg-black/20 px-4 py-3 text-sm text-slate-300">
              <summary className="cursor-pointer font-semibold">Enter setup key manually</summary>
              <code className="mt-2 block break-all text-emerald-300">{secret}</code>
            </details>
          </div>
        ) : null}

        {state === "challenge" ? (
          <p className="mt-4 leading-7 text-slate-300">Enter the current six-digit code from your authenticator app.</p>
        ) : null}

        {state === "enrol" || state === "challenge" ? (
          <div className="mt-6">
            <label className="text-sm font-bold text-slate-200" htmlFor="oversight-code">Six-digit code</label>
            <input
              id="oversight-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => { if (event.key === "Enter") void verifyCode(); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-2xl font-black tracking-[0.45em] outline-none focus:border-emerald-400"
            />
            {message ? <p className="mt-3 text-sm text-rose-300">{message}</p> : null}
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={busy || code.length !== 6}
              className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Open Oversight"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
