# Fleet scheduler and inferred transit

`/fleet/scheduler` is admin-only and uses the combined tracked fleet plus the existing Garboldisham yard polygon. Plant is the default parent category; brand is an independent filter beneath it. Dates are UK calendar days, inclusive at both ends. The diary preserves reservations even when a tracking source is missing.

Available means a linked machine has a valid, dated GPS position inside the yard and no reservation overlapping the chosen period. It is location-based availability, not mechanical clearance or a promise of future availability. Outside means on hire/away; stale, missing or boundary-band readings need attention. Transit overrides the yard label. Reservations on machines currently away are clearly described as plans needing return confirmation.

`fleet_reservations` is service-role only, with row security enabled. Admin authorization precedes reads/writes. A PostgreSQL exclusion constraint rejects overlapping reserved date ranges for the same machine, including concurrent requests. Cancellation retains the row and actor/time audit; request UUIDs make retries idempotent. No parts tickets or hire contracts are changed.

Asset Care+ telemetry now retains explicit ignition and kilometre odometer readings. Engine running is deliberately not inferred from ignition. Two distinct ignition-off readings at most 30 minutes apart must show at least 100 metres by odometer or GPS, aligned within two minutes of those readings. Speeds above 180 km/h, resets, GPS drift, stale timestamps and unknown ignition do not qualify. The inferred In transit label expires after 30 minutes. A later stopped/no-movement observation clears it.

The rule currently has evidence from Asset Care+. The checked manufacturer feeds do not provide explicit ignition in the current normalizers; missing ignition never means off. Confirmed links allow a manufacturer-first combined record to inherit transit from its Asset Care+ tracker. Fault labels retain priority, with an additional transit badge. No trip history is exposed to requesters, and Asset Care+ status access stays admin-only.

Vendor units: [Key Telematics AssetCounterValues](https://www.keytelematics.com/docs/fleet-api/v2/#/definitions/AssetCounterValues) specifies odometer in kilometres. Database conflict prevention follows [PostgreSQL range constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT).
