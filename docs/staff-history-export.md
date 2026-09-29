# Staff vehicle history exports

Admins can expand **History & export** beside a vehicle in Staff (List or Tiles) or the Driving league. Choose inclusive UK dates (up to 31 days) and download PDF or CSV.

Each report includes the current assigned name/department, daily first arrival/latest departure/recorded return status, speeding count, and all received yard and speeding events for the range. The archive start and latest saved batch appear in the report. The archive is not proof of complete per-vehicle coverage. Current assignment does not establish who drove historically; vehicle movement is not attendance. Provider speeding thresholds are not necessarily legal road limits. Harsh braking/cornering are unavailable.

`GET /api/staff/history` requires a verified admin session, a currently People-classified asset, `id`, `from`, `to`, and `format=pdf|csv`. Downloads use Authorization headers, private/no-store caching, and attachment responses. CSV cells neutralise formula prefixes. PDF reports paginate. Over 10,000 source events produces an explicit shorter-range error, never a silently truncated report.

Apply `20260929065104_staff_history_export.sql` before releasing. The read-only, security-invoker RPC is callable only by service_role and filters by configured Asset Care owner and selected asset. It reads received archive events, including late arrivals. It does not change daily Staff calculations or publish raw tracker payloads.
