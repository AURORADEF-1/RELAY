# Selected asset travel information

Admin fleet details and machine overview display a dated travel summary. Staff list, tiles and map popups also show it. Existing People visibility and admin-only movement-history restrictions remain enforced; the new summary endpoint requires admin access before database reads.

Asset Care+ TelemetryLocation provides speed in km/h, heading in degrees, and optional ReverseGeocode road/route names (`gc.rd` / `gc.rt`). RELAY converts speed to mph, retains the reading time, validates ranges, and never treats speed limits as vehicle speed. Trip-end positions are not treated as live travel readings. Positive GPS age retains an unknown timestamp. Documentation: https://www.keytelematics.com/docs/fleet-api/v2/#/definitions/TelemetryLocation

Readings older than five minutes or with no GPS time are labelled Last recorded. Near-zero speed shows Stationary at last report. No driver identity or behaviour is inferred from a vehicle's assigned name.

When a provider supplies no travel readings, direction can be estimated from distinct saved GPS points separated by 10 seconds to two hours, at least 50 metres apart, with a plausible displacement. This is explicitly estimated last recorded movement, not current heading, road routing, or instantaneous speed. Missing road names are omitted, not guessed from coordinates. No additional geocoding service is called.

The selected asset endpoint reads at most 200 snapshots within 48 hours, scoped to provider, pin and allowed machine ownership. It returns only the summary. The UI refreshes this saved-data summary once per minute while selected. This adds no vendor polling. Existing cached Asset Care+ records receive speed/heading/road fields as new telemetry is ingested; no historical backfill is performed.
