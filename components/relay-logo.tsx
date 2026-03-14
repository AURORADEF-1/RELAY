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
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(145deg,#0f172a_0%,#1e293b_55%,#475569_100%)] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.9)]">
        <div className="absolute inset-[5px] rounded-xl border border-white/10" />
        <div className="absolute left-[9px] top-[9px] h-3.5 w-3.5 rounded-full bg-cyan-300/85 blur-[1px]" />
        <div className="absolute bottom-[8px] left-[9px] h-[2px] w-23 rotate-[35deg] bg-white/75" />
        <div className="absolute right-[8px] top-[8px] h-6 w-6 rounded-full border border-white/50" />
        <div className="absolute bottom-[9px] right-[9px] h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-950">
            RELAY
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            AURORA SystemsTM
          </p>
        </div>
      )}
    </div>
  );
}
