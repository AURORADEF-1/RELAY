# RELAY Operations Assistant browser extension

The extension provides operating-system popup alerts for newly arriving RELAY admin notifications and transfers operator-selected catalogue part numbers to supplier or manufacturer webpages.

## Install in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `browser-extension` directory from this repository.
5. Pin **RELAY Operations Assistant** to the browser toolbar.
6. Refresh any RELAY tab that was already open.

## Admin notifications

1. Sign in to RELAY with an admin account and keep at least one RELAY tab open.
2. Open the extension and leave **Admin notifications** enabled.
3. New admin notification records will appear as Chrome or Edge operating-system popups.
4. Select a popup to focus RELAY and open its related ticket or workspace.

The extension does not store Supabase credentials or run independent database polling. RELAY's existing authenticated realtime and bounded fallback polling remain the notification source. Notification IDs are retained locally in a capped deduplication list so multiple RELAY tabs cannot create duplicate popups and old unread records do not become stale alerts.

## Parts lookup

1. Ask RELAY AI for a part using a verified machine reference.
2. Review RELAY's ranked catalogue candidates and select the closest description.
3. Select **Send selected number to extension**.
4. Open the relevant supplier or manufacturer catalogue page.
5. Open the extension and optionally select **Fill website search**. Review and submit the website's search yourself.
6. Select **Scan current page** after the website displays its results.
7. Review exact-number matches that expose the selected number as a part, SKU, MPN, product or catalogue number.
8. Select **Send suggestion to RELAY** for the candidate you want to review.
9. Mark the returned suggestion **Correct** or **Incorrect** in RELAY. Incorrect feedback is session-only and lets you return to the candidate list to choose another number.

## Search strategy

- **Every website:** RELAY displays its ranked catalogue numbers and descriptions first. The user selects one candidate, and only that exact number is passed to the extension. Machine model and request description are never included in the website search query.
- **Result filtering:** the scraper returns a result only when the same normalized part number is extracted from the website as a product, SKU, MPN or catalogue number. Model-only and description-only matches are discarded.
- Takeuchi scraper verification confirms that the suggested number appears on the Takeuchi website. It does not independently prove serial-range fitment, supersession or availability.

## Security and limitations

- Scanning occurs only after the user selects **Scan current page**.
- Admin popup payloads contain only the existing notification title, summary and safe RELAY route.
- Admin alerts require an authenticated RELAY tab to remain open; the extension does not copy or retain the RELAY session token.
- `activeTab` access is temporary and limited to the selected tab.
- Website cookies, passwords and form values are not sent to RELAY.
- The extension reads rendered visible text; it does not bypass logins, CAPTCHAs or access controls.
- The scan also reads product identifiers exposed in page metadata, JSON-LD and safe `data-*` attributes.
- Website searches are populated but never submitted automatically.
- Text-only mentions can explain why a page needs opening in more detail, but they cannot be sent to RELAY as a catalogued part.
- Results are suggestions, not verified fitment.
- Dynamic catalogues may require the user to run the website's own search first so results are visible.
- RELAY and the extension do not automatically place orders or update tickets.
