"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sanitizeAuthError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorShape = {
  detect: (
    source: HTMLVideoElement,
  ) => Promise<BarcodeDetectorResult[]>;
};

type BrowserWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorShape;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nextPath, setNextPath] = useState("/requests");
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanErrorMessage, setScanErrorMessage] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [scannedMachineReference, setScannedMachineReference] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);

  function stopScanner() {
    if (scanTimeoutRef.current !== null) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

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
        setHasActiveSession(true);
        router.replace(nextValue || "/requests");
      }
    }

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isScanOpen) {
      stopScanner();
      return;
    }

    let isCancelled = false;

    async function startScanner() {
      setScanNotice("");
      setScanErrorMessage("");
      setScannedMachineReference("");
      setIsCameraLoading(true);

      const browserWindow = window as BrowserWithBarcodeDetector;

      if (!browserWindow.BarcodeDetector) {
        setScanErrorMessage("QR scanning is not supported in this browser.");
        setIsCameraLoading(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setScanErrorMessage("Camera access is not available on this device.");
        setIsCameraLoading(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new browserWindow.BarcodeDetector({
          formats: ["qr_code"],
        });

        const scanFrame = async () => {
          if (isCancelled || !videoRef.current) {
            return;
          }

          try {
            const detections = await detector.detect(videoRef.current);
            const matchedReference = detections
              .map((result) => parseMachineReference(result.rawValue))
              .find((value): value is string => Boolean(value));

            if (matchedReference) {
              stopScanner();
              setScannedMachineReference(matchedReference);
              setIsCameraLoading(false);
              return;
            }
          } catch {
            setScanErrorMessage("The QR scan failed. Try holding the code closer to the camera.");
            setIsCameraLoading(false);
            return;
          }

          scanTimeoutRef.current = window.setTimeout(() => {
            void scanFrame();
          }, 250);
        };

        setIsCameraLoading(false);
        void scanFrame();
      } catch {
        setScanErrorMessage("Camera permission was denied or the camera could not be opened.");
        setIsCameraLoading(false);
      }
    }

    void startScanner();

    return () => {
      isCancelled = true;
      stopScanner();
    };
  }, [isScanOpen]);

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

  function handleContinueFromScan() {
    if (!scannedMachineReference) {
      return;
    }

    const destination = `/submit?machineReference=${encodeURIComponent(scannedMachineReference)}`;

    if (hasActiveSession) {
      setIsScanOpen(false);
      router.push(destination);
      router.refresh();
      return;
    }

    setNextPath(destination);
    setIsScanOpen(false);
    setScanNotice(`Machine reference ${scannedMachineReference} captured. Sign in to create the request.`);
  }

  function openScanModal() {
    setScanNotice("");
    setScanErrorMessage("");
    setScannedMachineReference("");
    setIsCameraLoading(false);
    setIsScanOpen(true);
  }

  function closeScanModal() {
    stopScanner();
    setIsScanOpen(false);
    setScanErrorMessage("");
    setScannedMachineReference("");
    setIsCameraLoading(false);
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

              {scanNotice ? (
                <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {scanNotice}
                </div>
              ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Authenticating..." : "Access Relay"}
            </button>

            <button
              type="button"
              onClick={openScanModal}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/14 bg-white/[0.04] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/24 hover:bg-white/[0.08]"
            >
              Scan Machine QR
            </button>
          </form>
        </section>
      </div>
      {isScanOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/72 px-4 py-6">
          <div className="w-full max-w-xl rounded-[1.5rem] border border-white/12 bg-slate-950/96 p-6 shadow-[0_28px_90px_-32px_rgba(15,23,42,0.9)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/72">
                  QR Intake
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                  Scan Machine Reference
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Point the camera at a QR code containing <span className="font-semibold text-white">Machine Reference XXXXX</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeScanModal}
                className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/8 hover:text-white"
              >
                Close
              </button>
            </div>

            {!scannedMachineReference ? (
              <div className="mt-5 space-y-4">
                <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>

                {isCameraLoading ? (
                  <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    Opening camera...
                  </div>
                ) : null}

                {scanErrorMessage ? (
                  <div className="rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {scanErrorMessage}
                  </div>
                ) : (
                  <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                    The scan will continue until a valid machine reference is detected.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
                  Machine Detected
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {scannedMachineReference}
                </p>
                <p className="mt-3 text-sm leading-7 text-emerald-50/86">
                  Create a parts request with this machine reference prefilled.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleContinueFromScan}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold uppercase tracking-[0.16em] text-black transition hover:opacity-92"
                  >
                    Create Request
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScannedMachineReference("");
                      setScanErrorMessage("");
                      setIsCameraLoading(false);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.08]"
                  >
                    Scan Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
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

function parseMachineReference(rawValue?: string) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.replace(/\s+/g, " ").trim();
  const matchedReference = normalized.match(/^machine reference[:\s-]+(.+)$/i);

  if (!matchedReference) {
    return null;
  }

  return matchedReference[1]?.trim() || null;
}
