# RELAY AI plant tracking

The administrator RELAY AI panel now supports plant tracking questions and director summaries. Suggested questions include a director plant summary, today's yard movements, trackers needing attention, and an exact fleet-reference location lookup.

The read-only GET `/api/plant/ai?question=...` authorizes the user as an administrator before reading the shared plant wallboard snapshot. Existing read-only administrators can use it; requester mode does not expose this data. Saved provider data is read on every question. It does not call an external language model or modify tracker assignments, tickets, asset records or provider settings.

Answers cover active, owned, linked plant only, using the wallboard last-known yard-polygon rules. Exact reference lookups show saved coordinates, provider and GPS timestamp where available. Missing records, undated/old GPS, source delays and incomplete movement history are stated explicitly. Movements support today, this week and this month, in UK time, newest first. Lists are capped at 20 movements or 30 assets with explicit truncation wording; supported date ranges and read-only limitations are stated rather than inventing an answer. Each answer has a source note and copy action.

The existing local semantic operations assistant, ticket/assignment confirmations and requester workflows are retained. Tracking intent is handled before generic machine-registry lookup so location questions retrieve tracking evidence. Existing session query limits apply in the panel; the server also caps question length and preserves the shared snapshot's bounded reads and private no-store responses.

Verification covers question routing, exact asset identity, wallboard-consistent totals, UK-day movement filtering, missing records, old timestamps, source warnings, unsupported ranges, authorization failure and unavailable data.
