# Plant director wallboard

Open `/plant-wallboard` from the administrator sidebar or Reports → Plant wallboard. Sign in with an administrator account, including an existing read-only administrator, then select Full screen on the display. No separate kiosk account or public access is created.

The board rotates every 25 seconds through:

1. Plant at a glance: out of yard, in yard, location unclear; today's departures and returns.
2. Plant activity: this week's and this month's departures, returns, average return-to-next-departure turnaround and returned-asset redeployment rate.
3. Recent movements: six cards at a time, up to the latest 36 movements this month. Subsequent rotations advance the page.

Screen buttons and Pause rotation hold the current view/page. Data continues refreshing once a minute without resetting rotation. Full-screen mode is a browser capability; a message directs users to the browser command if unavailable. The board is responsive for a laptop, 1080p/4K TV and a narrow screen. It suppresses in-app chat, print stations, notification sounds and pop-ups only on this route.

## Data and scope

`GET /api/plant/wallboard` requires administrator authorization before private database reads. It uses saved manufacturer fleet snapshots, saved Asset Care+ snapshots (when enabled), fleet grouping and existing yard events. It does not call telematics providers or create new database records/permissions. Responses are private and uncached.

Counts cover active, owned, linked assets identified as Plant. Staff/People, Vehicles, conflicting classifications, unclassified-only assets and unmatched/customer fleet identities are excluded. Duplicate provider identities count once. Location uses last known usable coordinates, including readings older than 24 hours or with unknown GPS time. The board shows how many classified assets use old/undated readings. An undated Asset Care+ snapshot is ordered by its telemetry observation time, without presenting that as GPS fix time. Missing coordinates fall back to saved position history. Conflicting same-time positions and assets with no usable saved coordinates remain unclear. Assets in the 20 m yard-boundary band count as in yard only when two distinct dated fixes, 1–30 minutes apart, are within 10 m, the latest is within 24 hours, and no contemporaneous transit is recorded. Ignition/engine off alone never proves stationary. Otherwise the boundary remains unclear. These are display-only rules; movement events and reporting freshness rules are unchanged. No precise coordinates or staff records are returned.

Out of yard does not confirm hire, and in yard does not confirm availability or readiness. Movements reuse the Reports deduplication and matching rules; they are GPS crossings, not contractual deployments. Week/day boundaries use UK time. Limited history is clearly labelled; absent duration/rate is a dash rather than zero. Movement totals use the current tracked plant cohort, so can differ from the all-asset yard report.

If a source read fails or reaches its guardrail, the endpoint fails rather than returning misleading partial totals. Refresh failure retains last verified figures with an attention banner and timestamp; after 150 seconds without success it is marked overdue. An access denial clears the displayed figures. A saved Asset Care+ collection warning remains visible even when the page refresh succeeds.

Validation covers deduplication, staff/vehicle exclusion, last-known/undated GPS, history fallback, stationary versus moving boundary positions, UK DST/week boundaries, pre-period turnaround, missing history, rotation timing, unauthorised requests, private caching and source failures. Physical TV/kiosk setup is separate from the browser release.
