# Manitou Track and combined Fleet map

Manitou Track (`/manitou`) uses the supplied Trackunit Classic read-only API alongside JCB. Admin Fleet (`/fleet`) links to `/fleet/map`, which combines both feeds with manufacturer filters, provider coverage, dated positions, machine selection and parts-request links. A failed provider is explicitly marked unavailable; it never appears as a successful empty fleet. Reports → Fleet Health offers separate JCB and Manitou assessments. Existing registry, tickets, RICO, front counter and JCB health schedule are preserved.

## Access and setup

- Apply `20260924120432_trackunit_fleet_health.sql`: additive Manitou mappings, scan status and digest deduplication tables; RLS enabled, mapping writes admin-only, health RPC service-role only.
- Set server-only production `TRACKUNIT_API_KEY`, `TRACKUNIT_ENABLED=true`, `TRACKUNIT_HEALTH_ALERTS_ENABLED=true`. The scheduler uses the already configured `JCB_HEALTH_DATABASE_KEY` and `CRON_SECRET`; no generic service key or browser key is introduced.
- The existing explicit `jcb_livelink_access` membership is the shared internal fitter tracking grant. Its current 28 enabled internal fitters gain Manitou access; admins have access automatically. Revoking this grant revokes both providers. Ordinary requesters/customer fleet members/front-counter accounts are not implicitly granted tracking access. JCB Access & linking labels explain the shared grant.
- Manitou UI has admin-only manual linking; this does not create or overwrite machine registry records. The combined endpoint and page require admin, and all Manitou endpoints re-check access server-side. Fitters get identity/location/faults, without admin telemetry. All authenticated responses are private/no-store.

## Data handling

- Fleet, telemetry and fault reads cache for 15 minutes. Trackunit Classic uses a token query parameter: it stays server-side; redirects are forbidden and errors are sanitised so upstream URLs/keys are never returned. No upstream writes are implemented.
- `referenceNumber` is used as the machine PIN; the tracking-device serial is not treated as the chassis serial. Match unique exact Manitou serials; exact fleet numbers can only be used when the registry serial is absent or agrees. Ambiguous, duplicate and conflicting references require admin review. Provider-qualified map keys prevent cross-brand identity collisions.
- Normalised fuel/AdBlue require percentage units and 0–100 values; hours require known hour units. Missing/invalid data stays missing; zero is preserved. Every reading retains its own timestamp. Original telemetry values/units remain available to admins.
- Fault requests always include a seven-day From/To range; omitting the dates returns HTTP 400. Display SPN and FMI, the provider description and reported date. Severity is not supplied by this endpoint and is not inferred from FMI. Current mechanical condition must be checked on the machine.
- Selected fault requests include only the selected latest code and its dated snapshot; the user explicitly adds it to normal request details. Unmatched machines cannot prefill a request. Existing validation and offline draft handling are retained.
- Manitou health uses recent reported faults, fresh low fluid levels and stale/missing positions. It does not interpret arbitrary lamp or sensor enumerations as diagnoses. An unavailable telemetry/fault check makes the assessment incomplete. Rule-based actions advise inspection, not confirmed repairs.
- Manitou checks run at minute 15 each hour; JCB retains minute 0. Per-admin/per-issue 24-hour deduplication prevents repeated alerts. New warnings generate one digest per admin. Monitor status distinguishes pending/overdue/incomplete scans.

## Verification, 24 September 2026

- All 80 machines returned valid positions; all 80 detail/fault calls succeeded. Hours available on 80; fuel on 77; 13 had fault records in the seven-day window. Values and counts are snapshots, not future guarantees.
- 67 exact registry serial matches. 13 require review: four LONG TERM HIRE entries, three SOLD entries, fleet numbers 26425–26428, and serial conflicts on 24152/24153. These remain visible but not automatically linked; no new registry records invented.
- Unit/route tests cover grants, admin-only combined view, partial outages, exact/ambiguous linking, unknown unit rejection, safe transport, units and fault-to-request context. Opt-in full live verification uses `TRACKUNIT_LIVE_CHECK=true` with a server-only key.
- `PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/verify-trackunit-rls.mjs` verifies the actual migrations in disposable PostgreSQL, including role restrictions, grant revocation, admin-only delivery and duplicate suppression.
- Phone 390px and tablet 820px previews passed horizontal-overflow and fault/request-link checks; combined-map manufacturer filter correctly removes other-brand markers. Fictional preview fixtures live only in an isolated temporary folder, not the deployed app.

Rollback: disable `TRACKUNIT_ENABLED` and `TRACKUNIT_HEALTH_ALERTS_ENABLED`, then redeploy, or revert this release. New tables can remain; existing fleet/ticket tables are untouched. Shared fitter grants are not modified by deployment.

Sources: https://api.trackunit.com/public/json/metadata?op=GetUnit ; https://api.trackunit.com/public/json/metadata?op=GetUnitExtendedInfo ; https://api.trackunit.com/public/json/metadata?op=GetReportUnitActiveFaults
