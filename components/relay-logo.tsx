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
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] shadow-[0_14px_36px_-20px_rgba(15,23,42,0.24)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aurora-logo.png"
          alt="Aurora Systems"
          className="h-full w-full object-contain p-1.5"
        />
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--foreground-strong)]">
            RELAY
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--foreground-subtle)]">
            Aurora Systems
          </p>
        </div>
      )}
    </div>
  );
}
