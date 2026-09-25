# Combined fleet classifications

The combined map keeps tracking source, registered brand, asset type, and imported cost centre as independent filters. Filters affect map pins, result cards, and exported positions; preferences persist in this browser. Manufacturer-specific pages ignore combined-only classification filters.

Prepare an Asset Care+ `Name,Cost Centre` CSV with `python3 scripts/prepare-fleet-groups.py INPUT.csv /private/tmp/groups.json`. Review the summary and import the resulting records into `fleet_asset_groups` using an authorised server connection. Never commit the input or generated records. The table is service-role only; the existing admin-authorised combined fleet endpoint adds the classifications.

Labels, fleet numbers and standard registrations are normalized and SHA-256 keyed. These hashes are lookup keys, not encryption. Conflicting keys and scientific-notation identifiers are excluded. Exact labels and unambiguous identifiers can match across providers. Machines without a confident match remain Ungrouped; no locations or trackers are invented from this CSV.

Plant and Stock retain those types. Explicit 7.5T, rigid, artic or HGV descriptions are classified HGV. Named-staff assets in the personnel/vehicle departments are People, retaining the department. Spare vehicles, vans and trailers remain Vehicles; Transport alone is not evidence of HGV. Review classifications when importing a differently structured CSV. Brand uses the RELAY register and otherwise the known manufacturer feed; Asset Care+ without a registered make is Unknown.
