# Staff driving league

Admin-only `/staff/driving`, linked from Staff. Uses the existing authenticated, private/no-store `/api/staff` data feed; no additional vendor requests or database changes.

The reporting window is today from midnight in Europe/London. Filter by department, name/registration, or vehicles with alerts. Sort by count, highest event speed, largest recorded excess, or label. Rank always reflects alert count in the current filter and ties share a rank. Missing history is unavailable, never a zero score.

Only provider overspeed start events are counted, deduplicated by asset/event/kind. Counts and maxima use all received events today; expandable evidence retains the existing latest-20 cap. Speeds convert from km/h to mph. Excess requires both speed and a positive provider limit and is not inferred from GPS. Provider thresholds are not independently verified statutory limits. Names describe assigned vehicles, not verified drivers. Scores are not normalized by mileage or time, and no disciplinary decision is automated.

The view refreshes saved RELAY data every minute. Provider delivery may lag. Historical periods, harsh braking and cornering are not available in this version.
