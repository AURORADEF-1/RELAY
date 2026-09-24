# Takeuchi Track (Trackunit AEMP)

Takeuchi account uses Trackunit API Keys v2 client credentials, not the separate Takeuchi-US API. Read-only scopes: `api.iso15143.snapshot api.iso15143.timeseries`. Store `TAKEUCHI_CLIENT_ID` and `TAKEUCHI_CLIENT_SECRET` as Sensitive Production Vercel variables. `TAKEUCHI_ENABLED=true` activates the provider. The existing server-only database key is reused for the shared cache and reporting collector.

Official references:
- https://developers.trackunit.com/docs/reference/getting-started/access-token-v2/
- https://developers.trackunit.com/docs/api-reference/aemp-iso-api/aemp-iso-api/
- https://developers.trackunit.com/openapi/aemp-iso-api.json

Fleet snapshots follow all provider next-page links (100 records/page), validate the destination, and reject duplicates, empty or unexpected-manufacturer responses. JSON field casing and `datetime` timestamps differ from JCB and have a dedicated adapter. Litres are accepted only with recognised units. Unreported idle hours remain unavailable.

Snapshot and per-machine seven-day fault results use a service-only database cache for at least 15 minutes. Atomic leases prevent concurrent provider fetches across instances; failures cool down rather than hammer the API. Fault failure is explicit, never an empty healthy assessment. No Takeuchi pop-up notifications are created.

Admin and existing explicitly granted internal fitters can use `/takeuchi`. Admin combined map, fleet reports and ROAM tracking feed include Takeuchi. Fitter responses expose locations, machine identity and dated faults, not administrator telemetry. Existing requester/customer/front-counter access restrictions remain. Parts-request context is verified server-side. Exact unique Takeuchi serial matches link automatically; unmatched machines remain visible but cannot create prefilled requests until an admin verifies a fleet-register link. Operational reporting and ROAM export include active verified MLP assets only.

Apply migration `20260924162253_takeuchi_fleet_integration.sql` before enabling. It adds mapping/cache tables with RLS and extends the existing reporting provider checks. No existing machines, requests, billing or notification data is changed. Hourly collection runs at minute 45; manual collection retains the 15-minute cooldown.

Initial review (24 September 2026): 173 Takeuchi assets over two pages; 170 GPS/hour readings, 166 fuel levels and 98 cumulative fuel readings. 109 exact serial matches; 64 awaiting verification. Three machines had no GPS. These counts are a snapshot, not fixed assumptions.
