# Fleet fuel reporting

Reporting begins at midnight Europe/London on 24 September 2026. The default window is the current UK calendar day to the report time; it resets at each UK midnight. Seven- and thirty-day reports include the current calendar day and are clamped to the launch date. UK clock-change days have 23 or 25 hours. Pagination retains the same report end time.

Fuel totals remain measured changes between timestamped cumulative litre counters. Counter resets, intervals crossing the window start, and unsupported long gaps are excluded, not prorated. The current day is partial. Launching this view does not create missing midnight readings; the coverage display describes available history.

Location allocations first use the existing GPS-bracket checks or close GPS timing estimates. Under the approved operational policy, intervals with inadequate history or observed crossings are allocated wholly to the latest valid reported yard/on-hire side available by the report end. This last-known-status estimate can use stale positions or a position reported after the fuel interval; it is not evidence of where that fuel was consumed. Estimated litres are labelled separately in the summary, machine rows, details and CSV. Changing the latest position may change historical estimated allocations when the report is refreshed.

Fuel from machines with no valid position remains in total consumption and is flagged as needing location attention. It is never silently discarded, set to zero, or assigned an invented position. The daily window does not guarantee complete provider coverage.
