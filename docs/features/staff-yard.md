# Staff yard presence

`/staff` is admin-only, with list, map and tile views and department/status/name filters. `/api/staff` authenticates the admin before reading data. Responses use private, no-store caching; no data is persisted in browser storage. Requesters do not get a navigation entry or API access.

Uses existing People asset classifications, Asset Care+ saved positions and the approved Garboldisham yard polygon. It adds no vendor API calls or database changes. Counts represent assigned vehicles, not verified people present.

Positions over 30 minutes old retain their last known yard category, marked Not checked in. Valid coordinates without a timestamp also retain their location category, explicitly labelled GPS time unavailable. Invalid/future current readings fall back to the newest valid stored position. No coordinates or the existing 20 metre boundary uncertainty band remain uncertain. This is a last-known-location assumption, not confirmation that a vehicle or person is stationary. Two distinct observations on the new side confirm a crossing when prior evidence exists. A single initial observation establishes vehicle location but no arrival time. Replayed timestamps cannot confirm a transition.

The collector retains only a small recent position window. The page can show a crossing evidenced within that window; it does not provide a persistent attendance ledger or payroll timesheet. A parked vehicle is not proof the driver is present. Manual check-in and durable attendance history are not part of this view.

Development-only `/preview/staff` contains fictional examples and returns 404 in production. No migration required. Local verification: 339 tests passed (2 external API tests skipped), lint and type-check passed; production build checked separately.
