export function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.trim().toUpperCase() || "PENDING";

  return (
    <span className="status-badge" data-status={normalizedStatus}>
      <span className="status-badge-dot" />
      {normalizedStatus.replaceAll("_", " ")}
    </span>
  );
}
