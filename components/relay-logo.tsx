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
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.22)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aurora-logo.png"
          alt="Aurora Systems"
          className="h-full w-full object-contain p-1.5"
        />
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-950">
            RELAY
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
            Aurora Systems
          </p>
        </div>
      )}
    </div>
  );
}
