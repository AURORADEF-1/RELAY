# RELAY to RICO fleet feed

## Purpose

This read-only partner feed lets RICO synchronize the physical machine registry
held by RELAY. RELAY remains the source of truth for which machines exist,
their serial numbers, plant references, operational status, and future meter
readings. RICO remains the source of truth for compatible filters, oils, and
service kits.

## Endpoint

```text
GET https://relay-ryoz.vercel.app/api/partners/rico/fleet
Authorization: Bearer <RICO_FLEET_FEED_TOKEN>
```

The endpoint returns JSON and does not accept writes.

### Query parameters

| Parameter | Default | Rules |
| --- | ---: | --- |
| `limit` | `200` | Integer from 1 to 500 |
| `offset` | `0` | Non-negative integer |
| `updated_since` | none | ISO-8601 timestamp; filters on the RELAY `updated_at` value |

Follow `nextOffset` until it is `null`. A normal first request is:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $RICO_FLEET_FEED_TOKEN" \
  "https://relay-ryoz.vercel.app/api/partners/rico/fleet?limit=200&offset=0"
```

An incremental synchronization can use:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $RICO_FLEET_FEED_TOKEN" \
  "https://relay-ryoz.vercel.app/api/partners/rico/fleet?updated_since=2026-07-01T00:00:00Z"
```

Use a small overlap when advancing `updated_since`, and de-duplicate by
`relay_id`, to avoid missing records changed at the boundary timestamp.

## Record grain and mapping

The feed contains one existing RELAY registry row per physical machine with a
usable serial number. It does not expand the registry's `quantity` field,
because that field is also used for stock-style tools and attachments.

| Feed field | RELAY source |
| --- | --- |
| `relay_id` | Stable `machines.id` UUID |
| `machine_ref` | `null` until RICO's `machineRef` is persisted in RELAY |
| `manufacturer` | `machines.make` |
| `model` | Cleaned `machines.model`, with equipment descriptors removed |
| `serial_number` | `machines.serial_number` |
| `plant_reference` | `machines.machine_number` |
| `fleet_number` | `machines.machine_number`; RELAY currently holds one operational plant/fleet reference |
| `type` | Normalized from fleet type and description |
| `status` | `active`, `disposed`, or `sold` |
| `status_detail` | Original RELAY operational status |
| `description` | Original machine description |
| `created_at`, `updated_at` | RELAY registry timestamps |

Fields not currently held in the machine registry are returned as `null`.
These include engine, year, serial range, hours, service intervals, location,
and notes. They must not be inferred.

Rows with missing or placeholder serial values are excluded. The response
reports their count in `excluded.missing_or_placeholder_serial`.

Disposed and sold machines remain in the feed with an explicit lifecycle
status. RICO must not interpret a record disappearing as a disposal.

## Authentication and rotation

`RICO_FLEET_FEED_TOKEN` is a server-only random bearer token configured as a
sensitive Vercel environment variable. It must not use a `NEXT_PUBLIC_` name.

For zero-downtime rotation:

1. Set the old value as `RICO_FLEET_FEED_TOKEN_PREVIOUS`.
2. Replace `RICO_FLEET_FEED_TOKEN` with a new random value.
3. Give RICO the new value and confirm a successful pull.
4. Remove `RICO_FLEET_FEED_TOKEN_PREVIOUS`.

Missing and invalid tokens receive the same `401` response. Tokens and raw
database errors are never returned or logged.

## Data access and scheduling

The route validates the Vercel bearer token before making a database request.
It then calls the narrowly scoped `rico_fleet_feed_page` RPC using the normal
Supabase anon transport. The security-definer RPC independently compares the
partner token's SHA-256 digest with a value held in the unexposed `private`
schema before reading `public.machines`. It does not grant anon users general
machine-table access.

The raw partner token and its digest are not committed. Responses use
`Cache-Control: private, no-store`.

RICO can run a full pull initially and then use `updated_since` nightly or
monthly. A nightly incremental check is recommended even if business review is
monthly, because the bounded feed is inexpensive and catches additions or
status changes promptly.

## Known limitations

- RELAY does not currently store RICO's `machineRef`, so it is returned as
  `null`. RICO should anchor records using `relay_id` and serial number until a
  durable cross-system mapping is added.
- Hours, service intervals, engine, year, and location are not available in
  the current machine registry.
- The feed is read-only. It does not update RICO or accept callbacks.
- Only serialized physical machines are exported.

## Database installation

Apply `docs/rico-outbound-fleet-feed-schema-2026-07-29.sql`, then insert the
generated token digest into `private.rico_fleet_feed_credentials`. The schema
script deliberately does not contain a credential.
