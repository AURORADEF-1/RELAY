# RELAY → ROAM tracked MLP assets

`GET /api/partners/roam/tracking` accepts `Authorization: Bearer <ROAM_TRACKING_FEED_TOKEN>`.
The token is dedicated to tracking, server-only and production-only. Optional
`ROAM_TRACKING_FEED_TOKEN_PREVIOUS` supports rotation. No RICO credential fallback.
`ROAM_TRACKING_ENABLED=true` enables the feed. Existing `JCB_HEALTH_DATABASE_KEY`
is used server-side solely for registry, mapping and ownership reads; it is never
returned or sent to ROAM.

Version 1 returns a complete bounded snapshot (no pagination): `schema_version`,
`generated_at`, `complete`, `sources`, `assets`, `excluded`. Source availability
is independent: one provider failure returns HTTP 200 with `complete:false`;
both failures or unverifiable ownership return 503. Missing/invalid token: 401.
All responses are private/no-store. Raw provider/database errors are suppressed.

Only assets with verified RELAY mappings, active lifecycle, no customer fleet
assignment and valid nonzero coordinates are exported. Unmatched, sold,
disposed and customer-owned machines are withheld. IDs are stable `relay_id`
UUIDs; `tracking_id` identifies provider/PIN. If providers overlap, newest
position wins for that RELAY asset. Registry and ownership tables are fully
paged; exceeding the guard fails closed rather than exporting partial scope.

Each asset carries fleet number, manufacturer, model, serial, provider,
latitude, longitude, `position_at`, `position_status`, `feed_checked_at`.
Unknown report times remain null; future times are flagged; positions older
than 24 hours are stale. Feed fetch time is never substituted for GPS time.
No fault details, user data, jobs or credentials are exported.

ROAM config: `RELAY_TRACKING_URL=https://relay-ryoz.vercel.app/api/partners/roam/tracking`
and `RELAY_TRACKING_TOKEN` holding the same dedicated token. Its manager-only
`GET /api/tracking` validates the contract and caches for at most 60 seconds.
The Asset tracking map checks while open; provider caches refresh approximately
every 15 minutes. This is last-reported tracking, not continuous live GPS.
Failed fetches clear displayed results and show an error. Drivers cannot access
the fleet-wide tracking endpoint. Hire delivery pins and jobs are unchanged.

ROAM source is maintained separately. This release's working copy is
`work/roam-tracking` in the parent task workspace, copied only after SHA-1
comparison of all 34 source files against production deployment
`dpl_EgRFUwMrRD3PjP9os1DqA17pMtF1`.
