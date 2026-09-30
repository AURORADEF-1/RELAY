# ROAM current hires in RELAY

Admin workspace: `/fleet/hires`, linked from the console and Fleet map.

RELAY reads `https://roam-henna.vercel.app/api/partners/relay/hires` using the dedicated server-only `ROAM_RELAY_HIRES_TOKEN`. Set the same production key in ROAM and RELAY. Do not reuse tracking, RICO, database or user credentials. No database migration is needed.

The RELAY browser calls `/api/integrations/roam/hires` with its normal authenticated session. Every list/detail/photo route checks the existing exact administrator-role policy before fetching ROAM. The integration key never reaches the browser. Responses are private/no-store, upstream redirects are rejected, and missing configuration or invalid contracts fail closed.

Only scheduled/on-site real hires are returned. The view reads all pages and replaces its list only after successful completion; it refreshes every minute while visible. Failures retain the previous result with an explicit warning and last-loaded time. Matching uses the stable `machine.relay_id`; unmatched local machines remain visible without an invented mapping.

Hire details include customer/site contacts, schedule, delivery evidence, notes, administrative history and linked damage reports. Photo buttons request a fresh short-lived signed URL for a photo belonging to the current hire. Originals are shown when present. A closed hire/photo returns 404. Site/handover positions are not live telematics. This is a live read-through view, not an independent historical archive or a writer to ROAM.

Regression tests cover authorization before upstream access, schema validation, current status, canonical URL, secret isolation, upstream failures and photo links.
