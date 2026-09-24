# Fleet API allowance review — 24 September 2026

| Connection | Verified provider rule | RELAY protection |
| --- | --- | --- |
| Takeuchi / Trackunit Iris ISO 15143-3 | Snapshot: one request per URL per 15 minutes. Time series: one request per equipment and datapoint per 15 minutes, regardless of requested dates. Fleet snapshot maximum 50 requests/second per customer; single-element snapshots and time series each 500/second. | Shared 15-minute fleet/fault cache, stable machine/fault keys, complete pagination, atomic 15-minute leases. |
| Manitou / Trackunit Classic | A numeric contractual allowance for this account was not verified. Iris endpoint quotas cannot be assumed to apply to Classic. | Shared 15-minute fleet, telemetry and per-machine fault results. Telemetry is reused between reports and machine details. |
| JCB / legacy MixedFleetTelematicsService | A numeric contractual allowance for this legacy account was not verified. The newer JCB API is a different service. | Shared 15-minute fleet and per-machine fault results, including operational collections. |

Sources: [Trackunit AEMP rate limits](https://developers.trackunit.com/docs/api-reference/aemp-iso-api/aemp-iso-api/), [general fair-use rules](https://developers.trackunit.com/docs/reference/rest-apis-overview/rate-limit/), [Classic endpoint catalogue](https://api.trackunit.com/public/metadata).

Trackunit's troubleshooting pool of 50 extra calls per URL is not treated as routine capacity. Other integrations using the same customer account can also consume the vendor's allowance. Confirm JCB and Classic account-specific hourly/daily quotas with the suppliers; there is no verified remaining-quota balance exposed by the endpoints currently used.

## Guard behaviour

- Database coordination covers Vercel instances, users, fleet maps, machine details, fault scans, ROAM reads and scheduled/manual collections. User clicks cannot bypass the cache. Collection results themselves are shared for 15 minutes, preventing cron/manual overlap.
- RELAY applies its own per-provider ceiling of 20 outgoing attempts per one-second window and 300 per one-minute window. These are protective application settings, **not supplier allowances**. Auth requests, retries and pagination all count. Counters are isolated by provider; no credentials or provider URLs are stored.
- A 429 response pauses that provider across instances for at least 15 minutes. Longer `Retry-After` seconds or HTTP dates are honoured. A 503 carrying Retry-After gets the same handling. No automatic 429 retry is made. Already in-flight requests may finish.
- Fresh cached snapshots remain usable during a provider pause. Expired data is not silently relabelled fresh; unavailable fault checks remain unavailable rather than clear. Reading timestamps and successful check times are preserved.
- Failed/in-flight cache refreshes keep a 15-minute lease. A unique owner prevents an old worker overwriting a newer worker. Cache/guard database errors stop upstream calls instead of bypassing protection.
- Existing Takeuchi cache rows and leases are reused during rollout. The migration is additive. No API credentials, role grants, notifications, registry records or collection schedules are changed.

## Deployment and support

Apply `20260924165728_fleet_api_request_guards.sql` before the app release. The existing production-only `JCB_HEALTH_DATABASE_KEY` is used. New tables and functions are service-role only with RLS enabled; browser roles cannot read tracking payloads or reset budgets.

`fleet_api_budget` provides attempted-call totals, current minute/second usage, provider cooldown expiry and rate-limit response counts since rollout. These are RELAY's counters, not the supplier's total usage. Investigate recurring cooldowns before increasing internal ceilings. No load test should deliberately exhaust a live supplier allowance.

To roll back the app, retain the additive database objects and Takeuchi cache; the previous release remains compatible. Old application revisions do not enforce the new global controls, so a rollback restores that limitation.
