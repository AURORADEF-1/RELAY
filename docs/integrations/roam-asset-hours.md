# ROAM asset hours

ROAM records each meter reading with its machine, hire, movement, driver and timestamp. The separate authenticated `/api/partners/relay/hour-readings` feed retains readings from completed hires; it does not widen the existing current-hires or photo feed. Missing historic readings are never inferred.

RELAY logs readings in `roam_asset_hour_readings`, keyed by ROAM reading ID and linked by foreign key to `machines.id`. The five-minute cron and admin Sync ROAM now action perform a full validated sync. Repeated syncs update the same source ID. Readings removed by a ROAM correction are retained as inactive, rather than deleted. A failed or partial fetch never replaces the saved log. The latest driver meter reading is visible in Asset Hours; existing telematics/manual `machines.current_hours` values are not overwritten.

Admins can open **Asset Hours**, or **Hour readings / export** on an asset map panel. CSV exports include asset/fleet IDs, hire reference, customer, driver, recorded time, movement, meter hours, paired drop-off/collection readings, measured usage and review status. One row is one reading; paired usage is repeated on both readings, so group by asset and hire before totaling usage.

Usage requires exactly one drop-off and one collection for the same machine/hire. Negative differences, reversed times or duplicate movements require review. An unlinked collection stays unpaired. Dates and engine hours are distinct; recorded usage is not elapsed contract duration or an automatic invoice.

InspHire is not connected. Contract reference, assigned hours and excess hours remain null, with contract_status=awaiting_inspire. A future integration must map the InspHire contract and line to the ROAM hire/machine, define allowance periods and exclusions, and provide the authorised allowance before computing overage. No assumed 8-hour day, weekday allowance or charge has been introduced.

Database changes: `docs/integrations/roam-asset-hours.sql`. RLS denies direct anonymous/authenticated access; server routes enforce existing RELAY administrator access. The sync function is security-invoker and executable only by service_role. Existing ROAM read token and RELAY cron secret are reused; neither is exposed to browsers.
