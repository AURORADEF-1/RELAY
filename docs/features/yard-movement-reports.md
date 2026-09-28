# Yard movement reports

Reports → Yard movements reads existing `asset_events` through the signed-in user's Supabase client and existing administrator SELECT policies. No new access grants, writes, provider calls or schema changes are required. Read-only administrator accounts can generate and download reports.

Select this/last week, this/last month, a rolling range or custom dates. Weeks start on Monday. Yard report boundaries and buckets use Europe/London, including daylight-saving transitions. Current periods stop at report generation time. Totals can be grouped weekly or monthly; CSV includes summary, coverage, grouped totals and every movement row.

- Deployments and returns count observed, confirmed GPS boundary crossings, not hire contracts.
- Consecutive same-direction events for one machine are collapsed across providers, retaining the first observation. Exact duplicate event IDs are ignored. Missing opposite crossings therefore undercount cycles rather than inventing them.
- Yard turnaround is recorded arrival → next recorded departure, attributed to the departure period. Earlier history is loaded to match arrivals before the selected period. Unmatched events have unknown duration, never zero.
- Time away is departure → next return, attributed to the return period.
- Redeployment rate is distinct assets returned in the selected period that subsequently departed within that period, divided by distinct assets returned in the period. A repeated cycle counts an asset once. This is not fleet utilisation; recent returns have had less opportunity to redeploy.
- Readings are confirmation times, not exact physical crossing times. Missing tracker reports affect totals and durations. Stored movement history currently begins on 25 September 2026; the UI derives the earliest stored event for each report and warns about incomplete history.

The loader uses a fixed created-at cutoff, stable time/ID ordering and 500-row pages. It refuses to produce a partial report if a query fails or the 20,000-event guardrail is reached. Details are paginated at 50 rows; CSV contains all rows and escapes spreadsheet formulas. Historical zero buckets mean no observed crossings, not proof of no activity.
