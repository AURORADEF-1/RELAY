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
      <div className="relay-logo-mark flex h-14 w-14 items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assetcare-plus-logo.png"
          alt="AssetCare+"
          className="h-full w-full object-contain"
        />
      </div>
      {compact ? null : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--foreground-strong)]">
            AssetCare+
          </p>
        </div>
      )}
    </div>
  );
}
