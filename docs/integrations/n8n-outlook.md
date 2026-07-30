# n8n Outlook integration

RELAY accepts bounded, authenticated email metadata from the n8n workflow
connected to `parts@mervynlambert.co.uk`.

## Production endpoints

Health check:

```text
GET https://relay-ryoz.vercel.app/api/integrations/n8n/outlook/health
```

Inbound message processing:

```text
POST https://relay-ryoz.vercel.app/api/integrations/n8n/outlook/inbound
```

Both endpoints require:

```http
Authorization: Bearer <N8N_OUTLOOK_WEBHOOK_SECRET>
```

The inbound endpoint also expects:

```http
Content-Type: application/json
Idempotency-Key: <Outlook internetMessageId>
```

The body is the source of truth for idempotency. RELAY hashes
`internet_message_id` before storing it and rejects duplicate processing.

## Supported payload

```json
{
  "internet_message_id": "<message@example.com>",
  "conversation_id": "outlook-conversation-id",
  "sender_email": "supplier@example.com",
  "sender_name": "Supplier Name",
  "subject": "PO PO-100 delivery update",
  "body_text": "Expected delivery is 3 August 2026.",
  "received_at": "2026-07-30T09:00:00+01:00",
  "importance": "normal",
  "has_attachments": false,
  "attachments": [],
  "job_number": "51330",
  "po_number": "PO-100",
  "machine_reference": "24079",
  "delivery_eta": "2026-08-03T09:00:00+01:00",
  "tracking_number": "TRACK-100",
  "supplier_name": "Example Supplier",
  "classification": "EXACT_JOB_MATCH_CANDIDATE",
  "original_matches": {
    "job_number": {
      "value": "51330",
      "matchedText": "Job 51330"
    }
  }
}
```

Nullable extracted fields may be omitted or sent as `null`. Attachments are
metadata-only in this phase; binary data is not accepted.

## Matching behavior

RELAY checks exact, case-insensitive values against:

- `tickets.job_number`
- `tickets.purchase_order_number`
- `ticket_purchase_orders.purchase_order_number`

One exact ticket match adds a ticket activity note. The endpoint does not
change ticket status, assignment, ETA, PO state, or purchase-order data.

No match, multiple matches, conflicting job and PO references, and
machine-only messages return `REVIEW_REQUIRED`.

Example success:

```json
{
  "ok": true,
  "data": {
    "duplicate": false,
    "outcome": "SUCCESS",
    "eventId": "event-uuid",
    "ticketId": "ticket-uuid",
    "reason": "EXACT_JOB_AND_PO",
    "candidateCount": 1
  }
}
```

Example manual review:

```json
{
  "ok": true,
  "data": {
    "duplicate": false,
    "outcome": "REVIEW_REQUIRED",
    "eventId": "event-uuid",
    "ticketId": null,
    "reason": "MULTIPLE_MATCHES",
    "candidateCount": 2
  }
}
```

## n8n branching

After the HTTP Request node:

- `data.outcome = SUCCESS`: apply the `RELAY Processed` Outlook category.
- `data.outcome = REVIEW_REQUIRED`: apply `RELAY Needs Review`.
- `data.duplicate = true`: stop without sending another notification.
- HTTP `400`, `401`, or `413`: stop and require configuration review.
- HTTP `503`: retry up to three times with backoff.

## Security

- Store the bearer token in n8n Credentials, never in a Code node.
- The bearer token is a server-only Vercel variable.
- Supabase stores only its SHA-256 hash in a private credential table.
- The audit table has RLS enabled and browser roles have no table privileges.
- RELAY stores a SHA-256 digest of the Outlook message ID for idempotency.
- The audit ledger does not store the email body.
- Ticket activity stores a maximum 2,500-character plain-text excerpt.
- Rotate by setting the old token as
  `N8N_OUTLOOK_WEBHOOK_SECRET_PREVIOUS`, installing a new current token in
  n8n, then removing the previous token after validation.
