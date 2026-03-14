"use client";

type RelayLogoProps = {
  className?: string;
  compact?: boolean;
};

export function RelayLogo({
  className = "",
  compact = false,
}: RelayLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-300 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.9)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1502134249126-9f3755a50d78?auto=format&fit=crop&w=300&q=80"
          alt="Night sky"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18)_0%,rgba(15,23,42,0.48)_100%)]" />
        <div className="absolute inset-[5px] rounded-xl border border-white/20" />
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-950">
            RELAY
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            AURORA Systems TM
          </p>
        </div>
      )}
    </div>
  );
}
