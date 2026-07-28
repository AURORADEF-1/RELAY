# RICO Europe Dropshipper and Fleet APIs

## Purpose

RELAY uses two deliberately separate RICO integrations:

- **Retail catalogue** uses the Dropshipper API to search products that can be resold, with reseller pricing and stock.
- **Our Fleet** uses the Fleet API to read machines registered in Fleet Manager, verified fitted filters, oils, custom service kits, kit-component part numbers, fleet-account pricing and stock.

Both integrations are read-only. RELAY does not create addresses, submit orders, write Fleet Manager records or create purchase orders through either API.

## Architecture

- `lib/integrations/rico` is a server-only provider with Zod validation, typed normalisation, request timeouts, endpoint allowlisting, bounded pagination, safe errors and duplicate-request suppression.
- `fleet-client.ts` is a separate provider using the Fleet API bearer key. Its cache and request identity are isolated from the Dropshipper provider.
- `/api/integrations/rico/*` validates the RELAY bearer session and admin role before calling RICO.
- `/filters` is the authenticated console workspace.
- RELAY `machines` remains the source of truth for machine identity.
- RICO remains the source of truth for its catalogue, application fitment, account price and stock.
- Proposed products are written to the existing `ticket_parts` table with status `REQUESTED`. No purchase order is created.

## Environment

Configure these as encrypted server-side deployment variables:

```text
RICO_RELAY_API_KEY=<rotated key>
RICO_API_BASE_URL=https://ricoeurope.com/reseller-api
RICO_FLEET_API_KEY=<fleet key>
RICO_FLEET_API_BASE_URL=https://app.ricoeurope.com/api/customer
```

Never use a `NEXT_PUBLIC_` prefix. The Dropshipper key is sent by the server using RICO's documented `apikey` parameter. The Fleet key is sent only as an `Authorization: Bearer` header. Neither key is returned to the browser or logged.

## Supported RICO endpoints

| RELAY route | RICO operation | Purpose |
| --- | --- | --- |
| `GET /api/integrations/rico/products` | `products` | Bounded catalogue paging with live price and stock |
| `GET /api/integrations/rico/products/:id` | `product` | Single approved product |
| `GET /api/integrations/rico/manufacturers` | `manufacturers` | Machine make selector |
| `GET /api/integrations/rico/machines` | `machines` | Manufacturer/model application lookup and fitting kits |
| `GET /api/integrations/rico/cross-reference` | `crossref` | OEM or competitor reference lookup |
| `POST /api/integrations/rico/ticket-parts` | None | Add a confirmed proposal to RELAY |
| `GET /api/integrations/rico/fleet` | `GET /api/customer/fleet` | Search the account fleet |
| `GET /api/integrations/rico/fleet/:ref` | `GET /api/customer/fleet/:ref` | Machine, units, fitted filters, oils and kits |
| `GET /api/integrations/rico/fleet-parts` | `GET /api/customer/parts` | Parts used across the account fleet |

The documented `catalog` endpoint is supported by the provider allowlist for a future synchronisation process but is not exposed as a browser proxy.

## Authentication and authorisation

The browser sends its current Supabase access token to RELAY. Each route validates the token with Supabase Auth, creates a user-scoped Supabase client, and checks the existing `profiles.role` rules. RICO access is currently restricted to RELAY admins, matching existing parts-management permissions. Database writes remain subject to existing RLS.

## Price and stock snapshots

RICO prices are net account prices excluding VAT unless a documented `incl_tax=1` request is made. Stock is the live `quantity`; zero means the product may be back-ordered. When an operator confirms a proposed ticket part, RELAY records price, currency, stock and check time. These are snapshots, not guarantees. Refresh before ordering.

Fleet API prices are the fleet account's prices excluding VAT. They must never be presented as reseller catalogue prices. Fleet `freeStock` is live availability; a null price or stock value is displayed as “Ask RICO”, never as zero.

Apply `docs/rico-ticket-parts-schema-2026-07-28.sql` before enabling ticket additions. It only adds nullable provenance columns and indexes to `ticket_parts`; existing RLS remains in force.

## Safe testing

Automated tests use fictional responses and mocked `fetch`. They never call RICO. Run:

```bash
npm run lint
npm run type-check
npm test
npm run build
```

For manual testing, use a rotated development key with an approved test account. Confirm that browser network requests target only RELAY `/api/integrations/rico/*` routes and that no RICO key appears in HTML, JavaScript bundles, browser logs or response bodies.

## Audit trail

Adding a proposed part records structured source and confirmation fields on `ticket_parts` and appends a concise `ticket_updates` activity entry. Search keystrokes and full upstream payloads are not persisted.

## Known limitations

- RICO v2 documents catalogue paging but no server-side free-text or direct RICO-reference search parameter for `products`. RELAY therefore uses the documented `crossref` operation for entered references and does not fabricate a product-search contract.
- RICO machine search documents manufacturer, model, partial model (`q`) and series, but no serial-number parameter. RELAY displays and records the selected serial for operator verification without claiming that RICO checked it.
- Fleet Manager remains the master record. RELAY only reads the Fleet API and does not update machines, fitted parts or service history.
- A Fleet service kit exposes structured component part numbers through `kits[].filters[]`; RELAY displays only the components returned by RICO.
- A Filter List is intentionally temporary browser state until its items are attached to tickets.
- RICO ordering, address creation, dry-run ordering and order tracking are not implemented.

## Troubleshooting

- `RICO integration is not configured`: set both server-only variables and redeploy.
- Authentication error: rotate or verify the account key without printing it.
- Access denied (`403`): the account may not be approved for the requested catalogue or product. Confirm catalogue access with RICO Europe.
- API security gateway blocked the request (`502`): RICO's Cloudflare configuration challenged the server before the API processed the key. Ask RICO Europe to exclude `/reseller-api/*` from browser challenges and permit server-to-server API traffic.
- Empty machine result: verify the RICO manufacturer spelling and model; serial is not an upstream search parameter.
- Rate limited or timed out: retry after a short pause. The UI does not make automatic unbounded retries.
- Ticket add fails after lookup works: confirm the additive schema file has been applied and the signed-in profile has the existing admin role.
