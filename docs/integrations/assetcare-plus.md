# Asset Care+ export and combined fleet

Status: implemented locally; not enabled or deployed. Based on RELAY main 4afd924 plus the pending card-status PR #34. Do not release PR #34 indirectly without production approval.

## Confirmed API

- Official contract: https://export.eu1.kt1.io/swagger.json
- Lifecycle: https://mymotiasupport.freshdesk.com/support/solutions/articles/80000984950-http-export-task-for-developers-
- Data schema: https://www.keytelematics.com/docs/fleet-api/v2/
- GET https://export.eu1.kt1.io/v2/stream with the server-only `x-access-token` header.
- Response `{items, id}`. DELETE `/v2/stream/{id}` acknowledges that batch permanently. Without acknowledgement the batch can reappear after about two minutes.
- Long polling can wait 45 seconds; the provider documents HTTP 500 for no queued data. Treat this as an ambiguous/no-batch result, not an all-clear or an immediate retry.
- Read-only credential test on 25 September 2026 returned HTTP 200, 71 records: 44 telemetry, 14 events, 13 trips. No DELETE was sent. The private sample and credential are outside the repository.
- This is an update queue, not a fleet inventory endpoint. Quiet machines may not appear until they publish a record; the first batch must not be represented as the complete fleet. Request an initial fleet snapshot/export configuration from Asset Care+ if complete immediate coverage is required.

## Collection

Production-only secrets/configuration required:

- `ASSETCARE_API_KEY`: supplied export key, sensitive, never NEXT_PUBLIC or query string.
- `ASSETCARE_OWNER_ID`: verified MLP client identifier. Test response owner was Mervyn Lambert Plant Ltd, id `d0d5f9f9-fb6b-469e-ae2d-71f807181181`.
- `ASSETCARE_ENABLED=true`: enable only after migration and production approval.
- Existing `JCB_HEALTH_DATABASE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `CRON_SECRET`.

Cron runs every minute, independently of browser use, to avoid the user-reported seven-day inactivity disablement. At most 40 batches per invocation, 90-second cycle budget, deadline-aware GET (up to 50 seconds)/10-second DELETE timeouts, 25 MiB response limit and 10,000 records per batch. A shared three-minute database lease excludes overlapping workers; writes are owner-fenced and reject expired leases. The Vercel function limit is 120 seconds. Failed invocations leave queued records retryable. HTTP 429/503 pause at least five minutes and honour Retry-After; HTTP 401 pauses for an hour. No tight retry loop.

Order is GET -> atomically save complete raw batch and supported asset projections -> DELETE that batch -> record acknowledgement -> stop on empty/limit/error. Unknown record formats are saved before acknowledgement so parsing changes do not destroy them. The batch content hash deduplicates exact replays; newer asset readings cannot be overwritten by older replayed messages. No browser request calls the export service.

All three new tables use RLS with browser privileges revoked. Only service_role can execute collector functions. Admin routes authorize before reading saved positions. Asset Care+ remains admin-only as confirmed by the user; customer and fitter access is not expanded. The feed includes named-driver vehicles. Only the configured MLP owner is projected onto the map; raw records are never returned to browsers.

Run `node scripts/verify-assetcare-rls.mjs /path/to/@electric-sql/pglite/dist/index.js` before applying the generated migration. Migration remains unapplied in production.

## Reading semantics / integration scope

- Valid decimal-degree positions retain provider timestamps. A positive GPS age with undocumented units is shown with unknown age, never as a fresh fix.
- Telemetry `active` / `ignition` is not equated with engine running. No fault-code coverage, idle-hour unit or fuel unit is inferred. Missing faults never create green healthy cards.
- Trips/events are retained in raw queue storage; this release projects locations and explicitly documented operating hours. It does not yet add Asset Care+ trips to the separate Asset Search history, fuel reports, ROAM export or fault inbox.
- Exact full fleet-number, explicit numeric fleet-number prefix (for example `25600 - 6T Mecalac Dumper`), or serial matching only; no fuzzy matching driver/vehicle names to plant. Unlinked assets remain visible to admins but cannot prefill parts requests. Linked retired/customer machines are excluded. For confirmed duplicate RELAY identities, manufacturer data is preferred in the combined view.

## Map

Provider checkboxes, query, status, GPS freshness and yard/away filters. Preferences stored in this browser only. Optional yard boundary/labels/clustering. Rendering uses zoom-based groups and viewport culling; lists show 60 per page. Explicit Fit shown assets control; routine refresh/layer changes preserve the user's zoom.

Satellite layer uses MapTiler's documented satellite-v4 raster map and attribution: https://docs.maptiler.com/leaflet/examples/detect-retina/

Requires a licensed, domain-restricted **public mapping key** in `NEXT_PUBLIC_MAPTILER_KEY`, separate from the private tracking key. Without it, street map works and satellite is visibly unavailable. No mapping key/account was supplied, so satellite loading is not verified or activated.

## Release and checks

- 288 tests passed (284 in the full suite plus four new route-access checks), two credential-dependent live suites skipped.
- TypeScript, ESLint, release invariants and production webpack build passed in a clean isolated source copy. Local cloud duplicate files were preserved.
- SQL role, lease, replay and ordering checks passed in PGlite.
- New source contains no supplied Asset Care credential; service key remains outside Git/browser bundles.
- Desktop preview verified with 640 example assets: grouping, provider filtering and preference persistence. Preview: http://127.0.0.1:3018 (example data only).
- Production needs explicit approval, migration application, sensitive environment setup, deployment, canonical-alias verification, one durable acknowledged cycle, and admin/fitter access verification. The seven-day keepalive is not running until deployment is completed.

## Location views follow-up

The shared map now offers fleet overview, yard focus, selected-machine zoom and a large-map toggle. Selected locations expose Google Street View, satellite and terrain links in the map, popup and detail panel, including the standalone JCB workspace. These open Google Maps using its official Maps URLs and do not need a mapping API key. Embedded satellite remains separately gated on the licensed mapping account. Street View requests nearby imagery; it does not imply coverage, a current photograph or a live camera. Invalid/missing GPS produces no external location links. URL validation tests and desktop preview checks passed.

Vendor sample review: the telemetry asset UUID is the stable identity (not the tracker origin UUID); `date` is the measurement time (not `received`). Historical sample data stays historical. The vendor reference application uses a separate Fleet API user credential to bootstrap assets/devices before consuming the export queue. The supplied export key is not assumed to grant that inventory access. The user confirmed that the different token is an example only; retain the earlier tested credential.

### Bounded backlog collection

The scheduled collector checks every minute. Each run remains a single sequential consumer fenced by the database's three-minute lease, with at most 40 batches / 80 vendor requests and 500 ms between batches. It starts no new long poll after 45 seconds of its 90-second collection budget, reserving time to save and acknowledge; the function limit is 120 seconds. A backlog run allows the next scheduled check after five seconds; a confirmed empty queue pauses for at least a minute. No self-triggering workers or parallel queue consumers are used.

Every batch is stored durably before DELETE acknowledgement. Progress is saved after each acknowledged batch. Errors stop the run and retain the existing minimum five-minute cooldown (one hour for unauthorized responses); longer provider Retry-After values are honoured. The map reports incomplete draining and the latest processed provider receipt time, separately from GPS age. These receipt timestamps describe queue progress, not proof every machine has checked in.


### Thirty-minute collection target

The collector now starts batches during the first 45 seconds (previously 35), with GET timeout reduced to the remaining 90-second budget minus a 30-second completion reserve. The 40-batch/80-request cap, 500 ms pacing, single lease, durable save before DELETE, and provider cooldowns remain unchanged. A slow save can still run beyond the nominal budget; the 120-second function limit and retry-safe persistence remain the final safeguards.

The admin map warns inline for acknowledged queue progress older than 30 minutes, no successful collection within 30 minutes, or collection errors. A confirmed empty response counts as a successful check, even if parked machines have old GPS timestamps. Missing receipt times are labelled unconfirmed. Warning age updates every minute without extra provider requests; refresh the view to load new collection state. This is a collection target, not a guarantee that every tracker reports within 30 minutes. Intake and yard-event projection remain transactional before acknowledgement.
