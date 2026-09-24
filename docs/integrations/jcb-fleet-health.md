# JCB Fleet Health

Approved for release on 24 September 2026. Production activation is recorded separately after runtime verification.

## Behaviour

Reports → Fleet Health adds live JCB condition checks above the existing ticket-pressure report. The report scans six machines per request, three upstream fault calls at a time, and makes partial failures explicit. Fault severity comes from JCB; it is not a diagnosis. A major/critical/severe/fatal record within seven days gets inspection priority. Other recent faults require review; old, undated and future-dated records remain history/data checks. Duplicate codes and severities show their latest occurrence. The original report remains expandable.

Authorised internal fitters can view selected-machine faults and attach a dated code to a parts request. The fleet-wide health endpoint remains admin-only. Existing LiveLink grants still exclude ordinary requesters, customers and the front counter. Fitter responses continue to omit admin-only hours/fuel telemetry.

Fuel at or below 15% and AdBlue at or below 10% produce planning suggestions only when their readings are within 24 hours. Old readings ask for confirmation. Locations missing a valid report within 48 hours need checking. No result is presented as a mechanical all-clear.

## Notifications

An hourly Vercel cron checks the fleet using four workers and a bounded scan budget. Only faults reported within 24 hours, fresh low-fluid readings and missing/stale positions create admin warnings. Failed or incomplete scans produce a monitoring warning. A partial scan saves its next machine so the next hourly run resumes there rather than repeatedly skipping the end of the fleet. Notifications are a single digest per admin, with each machine/issue suppressed for 24 hours. Recipients are selected inside the database from trusted profiles with role `admin`; callers cannot supply recipient IDs. The RPC is SECURITY INVOKER and executable only by service_role. Fitters cannot call it, and the UI additionally suppresses this notification type for non-admin sessions.

Notification delivery and deduplication are atomic in one SQL statement. Rows in the delivery ledger have no authenticated grants. Scan status is admin-readable through RLS. Clicking the notification opens Reports → Fleet Health. Desktop notification delivery still requires the user's existing browser permission; stored in-app alerts do not.

## Activation after approval

1. Review the diff and pass regression/build checks through the protected PR workflow.
2. Apply `20260924100350_jcb_health_alerts.sql` after review.
3. Configure server-only `JCB_HEALTH_DATABASE_KEY` and `CRON_SECRET`; the current deployment may not have a service-role key. Keep `JCB_HEALTH_ALERTS_ENABLED=false` during setup.
4. Confirm the Vercel plan supports hourly cron and 300-second execution. Schedule is `0 * * * *` (UTC). Never expose server secrets through NEXT_PUBLIC variables.
5. Deploy only after user approval, enable the flag, run one authenticated scheduler check, verify admin-only delivery/deduplication and scan coverage in `jcb_health_runs`, and verify fitter access live.
6. Rollback monitoring by setting the flag false. New database objects do not alter fleet/ticket schemas.

## Preview

`RELAY_HEALTH_PREVIEW=true npm run dev -- --port 3012`

Open `/preview/jcb-health`. This route is disabled outside development. Both tabs use the real new UI components with clearly labelled illustrative data; no credentials, live machine data or side effects are included. Fault codes beginning DEMO are examples, not JCB reference codes.

## Validation

Unit tests cover freshness/severity/duplicate rules, failures, admin health access, fitter fault access and fault-to-request context. A temporary local PGlite PostgreSQL database verified migration execution, admin recipient filtering, repeat suppression, 24-hour renewal and restricted RPC permissions. Live migration/cron delivery remains pending deployment approval.
