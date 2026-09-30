# Return-to-hire workflow

Implementation branch: feat/fleet-hire-workflow. Not enabled or deployed by this change alone.

## Behaviour

Confirmed yard crossings (the existing two-report geofence check) start a new clearance cycle. Workshop, parts and hire each receive an inbox message. Repeated provider events and older crossings cannot reset completed checks. Existing confirmed crossings seed presence only; crossings older than 24 hours start as location unconfirmed.

A green release requires workshop inspection, parts confirmation, a next service date/hours threshold, no open parts requests or workshop jobs, no unreviewed fault events, and no active fleet flags. Missing service information and stale engine hours hold clearance. Workshop inspection records review of fault events; it does not change raw manufacturer fault data. Service completion is a separate recorded action, and does not automatically finish jobs or inspections.

Admins have all workflow actions. Admins designate workshop, parts and hire staff on the Return to hire screen. Only admins and designated hire staff can release or override. All actions require a reason, use optimistic version checks and record an audit entry. Access changes are also audited. No ordinary requester access is granted automatically.

Overrides stay amber and do not resolve faults. A change to blockers invalidates the override. On return, all previous inspection/release/override decisions reset. A confirmed departure records green, authorised override, or warning, including a warning when no work request/job is linked despite blockers. GPS is a reported position, not a physical gate interlock.

## Integration and activation

1. Apply `20260930120726_fleet_hire_workflow.sql` through the approved production migration process; first run the PostgreSQL regression test against an isolated database.
2. Deploy RELAY. Designate staff and enter verified service due thresholds. Do not bulk mark machines checked.
3. Set server-only `FLEET_WORKFLOW_ENABLED=true`. Scheduler then requires explicit clearance. The partner endpoint `/api/partners/roam/availability` uses the existing ROAM tracking bearer token and returns no staff names, notes, reasons or locations.
4. Integrate the companion `work/roam-hire-workflow` changes against the current ROAM release, preserving concurrent customer/hire changes. Set ROAM `RELAY_HIRE_WORKFLOW_ENABLED=true`; it uses existing `RELAY_TRACKING_TOKEN` server-side. The adapter is an isolated build, not a deployment of the active ROAM task.
5. Verify a fictional complete arrival-to-dispatch cycle in staging and verify role denial before production activation.

The partner feed describes recorded workflow machines. `unlisted_status=not_assessed` means unlisted machines MUST NOT be assumed available. ROAM fetches on application requests with a 30-second shared-process cache; it is not a push or background scheduler. Failed, inconsistent, incomplete or stale responses remove clearance availability, preserving ROAM hire/reservation/repair restrictions. With ROAM open, changes appear on its next state refresh; it refreshes when next opened otherwise. Driver and customer privacy remain governed by existing ROAM access rules.

## Validation

`npm test`, `npm run lint`, `npm run type-check`, and `npm run build -- --webpack`.

Database test: `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node tests/fleet-workflow-sql.mjs` (PGlite 0.3.14, installed outside the application). Fixtures are fictional; no production tables are changed.

## Local verification record

- RELAY: 462 tests passed; 2 optional live-provider tests skipped.
- Isolated PostgreSQL: arrival/departure ordering, replay, service thresholds, linked work, release, override invalidation, designation, customer-fleet exclusion and role denials passed.
- ROAM companion: 46 tests passed, including complete/stale/invalid feed rejection and preserving reservations/repairs.
- Final production build, release invariants, TypeScript and lint passed. Browser verified the actual workflow component with fictional API fixtures, including override reason and audit rendering. This is not a live end-to-end verification.
- Local preview: http://127.0.0.1:3030/ (fictional data).
- No production migration, permissions assignment, feature activation or deployment has been performed.
