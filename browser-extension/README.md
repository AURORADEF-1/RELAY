# RELAY Parts Lookup browser extension

The extension transfers an operator-selected RELAY catalogue part number to a user-selected supplier or manufacturer webpage. It searches only by that exact part number, scans rendered visible content and public structured product metadata locally, and returns only records exposing the same normalized number.

## Install in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `browser-extension` directory from this repository.
5. Pin **RELAY Parts Lookup** to the browser toolbar.
6. Refresh any RELAY tab that was already open.

## Use

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
- `activeTab` access is temporary and limited to the selected tab.
- Website cookies, passwords and form values are not sent to RELAY.
- The extension reads rendered visible text; it does not bypass logins, CAPTCHAs or access controls.
- The scan also reads product identifiers exposed in page metadata, JSON-LD and safe `data-*` attributes.
- Website searches are populated but never submitted automatically.
- Text-only mentions can explain why a page needs opening in more detail, but they cannot be sent to RELAY as a catalogued part.
- Results are suggestions, not verified fitment.
- Dynamic catalogues may require the user to run the website's own search first so results are visible.
- RELAY and the extension do not automatically place orders or update tickets.
