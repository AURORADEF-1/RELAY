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
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-300 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]">
        <span className="text-3xl font-black leading-none tracking-[-0.08em] text-slate-950">
          R
        </span>
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-950">
            RELAY
          </p>
        </div>
      )}
    </div>
  );
}
