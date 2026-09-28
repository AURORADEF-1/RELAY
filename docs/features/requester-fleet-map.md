# Requester fleet map

Fleet opens `/fleet/map` for signed-in RELAY profiles. Existing links with a `machine` query still open the fleet register. Requesters can search and filter JCB, Manitou/Trackunit, Takeuchi and Asset Care+ assets, then select an asset and use Directions to this position. Positions retain their reported timestamps, including old fixes; a missing fix cannot generate directions.

The combined fleet API authenticates the profile before privileged read-only retrieval. Admins retain the existing combined service. Requester responses classify every source before deduplication, exclude People and matching aliases across providers, and exclude unclassified Asset Care+ records. Classification failure returns an error rather than raw records. Source counts describe visible assets only. Collector internals and admin telemetry are omitted.

Provider detail/management endpoints, scheduler, reports, staff views and database permissions are unchanged. The requester map uses its safe snapshot for details and does not call privileged status or detail endpoints. No new account or credentials are needed.

Verification: requester authorization and denial, group failure/empty registry, People conflicts and duplicate identities, four provider coverage, partial provider outage, old position preservation, and the unchanged admin service are covered by tests. Actual requester browser sign-in requires an existing requester session; automated access tests do not substitute for that final account-level check.
