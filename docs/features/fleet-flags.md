# Fleet flags

Admins can select a tracked machine and save a manual flag with a reason. Active flags appear as red flag badges on map pins and list cards, and in the Fleet Map's Flagged tab. Flagged pins are not collapsed into clusters. Map provider colours and dated positions remain unchanged. Flags are manual annotations, not automatic theft or out-of-hours diagnoses.

A flag uses the RELAY machine ID where linked, otherwise the provider and tracker reference. Linked provider records share the flag. The Flagged list ignores map layer filters, supports name/reason search, and retains flags whose tracker is no longer in the available feed. Clearing requires a resolution note and keeps the stored reason, creating/resolving admin IDs and timestamps. No permanent deletion endpoint is provided.

`/api/assets/flags` authenticates admins before privileged reads/writes. The table has RLS enabled and no direct anon/authenticated privileges. Creation verifies the tracker against the server's fleet and derives labels and identity there. Partial unique indexes prevent duplicate active flags. Updates target the flag ID only while unresolved, avoiding stale clears of a later flag. Active reads are paginated and bounded; failures display unknown/unavailable rather than an all-clear.

The feature polls saved flags once per minute while open. It adds no tracker polling schedule or push notifications. Requesters do not receive flags, reasons or access to People assets. Flag management and display are admin-only in this version.
