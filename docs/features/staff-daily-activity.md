# Staff daily vehicle activity

Staff list and tile views show the first yard arrival, latest departure, latest return/state, all today's yard movements and provider-reported speeding alerts. Days and displayed times use Europe/London. No return means no later arrival event has been received today; it does not prove continued absence. Vehicle presence is not driver attendance.

Daily data comes from archived Asset Care+ zone events for the verified Mervyn Lambert Yard zone, not extrapolated from the last three GPS fixes. Speeding uses explicit overspeedevent/start events, with supplied speed and limit in km/h. Harsh braking/cornering coverage is unavailable. Replays are deduplicated; missing history remains unavailable rather than a clean driving assessment. Conflicting simultaneous crossings are flagged.

The service-only SECURITY INVOKER staff_daily_events RPC returns a bounded JSON projection; raw archive permissions and all staff admin-only authorization remain intact. The additive function has been applied and verified on RELAY; migration records the exact definition. Archived receipt lookback is bounded to two days before today's start. Provider delays and missing events can make the daily picture incomplete. Position status and event-based daily state can differ when GPS is old or zone geometry differs.
