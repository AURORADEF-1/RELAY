type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

export function ReportDonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: ChartSegment[];
  centerLabel: string;
  centerValue: string | number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;

  return (
    <div className="report-donut-layout">
      <div
        className="report-donut"
        role="img"
        aria-label={segments.map((segment) => `${segment.label}: ${segment.value}`).join(", ")}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="report-donut-track" cx="50" cy="50" r="40" pathLength="100" />
          {total > 0
            ? segments.map((segment) => {
                const percentage = (segment.value / total) * 100;
                const currentOffset = offset;
                offset += percentage;
                return (
                  <circle
                    key={segment.label}
                    className="report-donut-segment"
                    cx="50"
                    cy="50"
                    r="40"
                    pathLength="100"
                    stroke={segment.color}
                    strokeDasharray={`${percentage} ${100 - percentage}`}
                    strokeDashoffset={-currentOffset}
                  />
                );
              })
            : null}
        </svg>
        <div className="report-donut-center">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="report-chart-legend">
        {segments.map((segment) => (
          <div key={segment.label}>
            <i style={{ backgroundColor: segment.color }} />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportBarChart({
  rows,
  valueLabel,
}: {
  rows: Array<{ key: string; label: string; value: number; detail?: string }>;
  valueLabel: (value: number) => string;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);

  return (
    <div className="report-bars">
      {rows.length > 0 ? rows.map((row) => (
        <div className="report-bar-row" key={row.key}>
          <div className="report-bar-label">
            <span title={row.label}>{row.label}</span>
            <strong>{valueLabel(row.value)}</strong>
          </div>
          <div className="report-bar-track" aria-hidden="true">
            <i style={{ width: `${maxValue > 0 ? Math.max(3, (row.value / maxValue) * 100) : 0}%` }} />
          </div>
          {row.detail ? <small>{row.detail}</small> : null}
        </div>
      )) : (
        <p className="report-inline-empty">No data is available for this period.</p>
      )}
    </div>
  );
}
