# JCB LiveLink

`/livelink` adds a selectable fleet map, list, timestamped positions, admin telemetry and fault history, CSV reporting, fitter access management and machine linking. The map popup and detail panel both open the existing `/submit` parts-request flow. The request context endpoint checks the caller and machine link before returning a snapshot which the requester can add to the normal request details. Normal form validation and offline submission are preserved.

## Enablement

1. Apply `20260924090311_jcb_livelink_access_and_mappings.sql` after the existing profile-role hardening migration. It adds only two new RLS-protected tables; it does not change existing fleet rows or ticket policies.
2. Configure **server-only** `JCB_LIVELINK_USERNAME`, `JCB_LIVELINK_PASSWORD`, `JCB_LIVELINK_CLIENT_SECRET` and `JCB_LIVELINK_ENABLED=true`. Never use `NEXT_PUBLIC_` for JCB credentials. Disabling the flag removes access and the navigation entry.
3. Sign in as an existing RELAY admin, open `/livelink`, and check full fleet count and exact matches. Resolve unmatched/ambiguous assets using **Access & linking** after physically verifying the full PIN.
4. Enable only intended internal fitter accounts in **Access & linking**. No requester or customer-fleet member is automatically granted company-wide location access. Admins retain their existing profile-based admin access. Revocation is checked on every API request (an already displayed page cannot be remotely erased).
5. Pilot map selection → parts request → add snapshot → ordinary ticket submission with one fitter and one admin. Verify the created ticket retains the original reading timestamps. Do not use real test tickets without a clear test label and authorised account.

## Data behaviour

- The Next.js server Data Cache shares complete fleet/fault reads for 15 minutes. Reads revalidate on demand; this release does not run an unattended background sync. Cached fleet age and original reading timestamps are displayed separately. An upstream failure never publishes a partly fetched fleet.
- Token renewal is server-only with coalesced in-flight authentication. Requests have timeouts, forbid redirects and validate pagination destinations before sending a bearer. A 401 retries authentication once; a 429 is surfaced without a retry storm.
- Full PIN or exact equipment-ID/fleet-number matching is restricted to JCB registry records and must be unique. Manual mapping is one-to-one. No serial-suffix or model-only matching is attempted. Unmatched machines remain visible but cannot silently prefill the wrong RELAY machine.
- Fitters receive identity, position and verified RELAY link fields only. Health/fault endpoints and the management API require admin access server-side. All client API responses use `private, no-store`.
- Missing values remain missing; numeric zero and stopped engines are preserved. Position warnings begin at 24 hours and 48 hours. A historical engine-state timestamp is not itself an offline-tracker diagnosis.
- Faults retain code, description, severity and timestamp. The feed does not identify active/cleared state; this UI does not infer it or replace RELAY's existing workshop-based health scoring.
- CSV exports reflect the filtered fleet and include per-field timestamps and source fetch time. Fault history is shown per selected machine; it is not silently fetched for every fleet asset during export. PDF reporting and historical trend charts are not included in this release.
- Location/fault context is copied to ordinary request details after explicit selection. It is a retained dated note, not a cryptographically attested or uneditable telemetry attachment. Existing request-edit permissions still apply.

## Map

Leaflet 1.9.4 renders real coordinates using standard OpenStreetMap raster tiles, with visible attribution. Tiles load only when map view is open. Do not prefetch for offline use. Browser referrer policy must allow an identifying origin. For a high-volume rollout, switch to a contracted tile provider. External directions open only after the user clicks the link and include the selected coordinates.

References: [Leaflet](https://leafletjs.com/reference.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), and the supplied JCB AEMP v2.0 guide (20.09).

## Verification

Run `npm test`, `npm run lint`, `npm run type-check`, `npm run release:verify` and `npm run build`. The opt-in `tests/jcb-live.test.ts` uses `JCB_LIVE_CHECK=true` plus server credentials for read-only live checks. Ordinary tests never contact JCB. `scripts/verify-jcb-rls.mjs` applies the actual migration to disposable PostgreSQL using PGlite and verifies 20 permission checks. Install `@electric-sql/pglite@0.5.8` outside the app and set `PGLITE_MODULE` to its `dist/index.js` path to run it. The fixture models the existing protected profile roles; it does not replace a check with enabled and disabled real accounts in the deployed environment.

No existing RICO, wallboard, Parts Control or front-counter behaviour is replaced.

## Build verification — 24 September 2026

Built from latest `origin/main` (`db234b4`), re-fetched before packaging. Full suite: 126 tests pass; opt-in live check separately passes with 212 machines and 212 positions. Disposable PostgreSQL: 20 permission checks pass. Lint, release integrity and production build pass. Browser checks used fictional machine fixtures and covered map selection, request-link targets, fitter/admin differences, stale/unmatched assets and a 768px tablet layout without horizontal overflow. The temporary fixture route was removed.

Production enablement, actual account-role verification, machine-match review and a labelled ticket-submission pilot remain rollout steps. No production schema, environment settings or real tickets were changed by this build.
