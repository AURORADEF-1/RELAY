# Asset Search and Asset Inbox

`/assets` searches active MLP-owned machines by fleet number, serial, make and model. Administrators also search live and completed job records through the existing smart search. Internal fitters require the existing enabled LiveLink access grant. Customer/front-counter users are not granted asset access.

A machine record shows the latest saved position with its original timestamp, accessible parts/workshop history, an on-demand provider fault check and on-demand recorded GPS history. Job history retains existing row-level permissions. It returns the latest 100 records of each type, indicating when limited. GPS history covers 1, 7 or 30 days, capped at 5,000 saved samples of the current tracker/provider. Cached GPS reports are deduplicated by their original timestamp. Lines represent displacement, not exact road routes; gaps over two hours are not joined. Data before collection began cannot be reconstructed.

`/assets/inbox` is admin-only. Events and personal read/acknowledge receipts use separate tables, RLS and security-invoker functions. The collector writes no notification rows and triggers no pop-ups or sound. The sidebar count reads the database at navigation, after actions, and every five minutes while visible. Search and inbox loading do not call provider APIs.

## Collection

Apply `20260925084829_asset_search_inbox.sql`, then set server-only `ASSET_INBOX_ENABLED=true`. The existing hourly fleet collection schedules also capture asset events. Existing provider caches, request limits, cooldowns, four-worker concurrency and collection cursor/time limits still apply. Fault checks during collection share existing guarded provider methods. A failed inbox write counts as a collection failure without discarding the saved machine sample. Disable the flag to stop new events while retaining history.

- Yard crossings require two distinct GPS readings on the new side, following an opposite-side reading, within two hours.
- General movement requires at least 300 metres between two fresh same-side reports within two hours.
- Positions older than 24 hours generate a deduplicated not-checked-in event.
- Dated faults deduplicate by provider, tracker, code and reported timestamp. Undated faults have one stable event per code and explicitly show first-observed time. No fault is inferred resolved from absence.
- Unavailable checks remain visible; empty results are not a fleet health guarantee.
- Acknowledgement is personal and does not mean a fault is repaired.

## Verification

`tests/asset-events.test.ts` covers GPS freshness, duplicate snapshots, confirmed crossings, gaps, drift, fault timestamps and event keys. `tests/asset-access.test.ts` checks exact admin and explicit fitter access. `scripts/verify-asset-inbox-rls.mjs <absolute PGlite module path>` applies the real migration to an isolated database and verifies admin-only reads, service-only event writes, personal receipts, deduplication, preserved acknowledgements and anonymous denial.
