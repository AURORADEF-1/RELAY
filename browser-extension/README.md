# RELAY Parts Lookup browser extension

The extension transfers a machine and part-search context from RELAY AI to a user-selected supplier or manufacturer webpage. It scrapes rendered visible content and public structured product metadata locally, ranks possible matches, and sends a selected numbered catalogue candidate back to RELAY AI as an unverified suggestion.

## Install in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `browser-extension` directory from this repository.
5. Pin **RELAY Parts Lookup** to the browser toolbar.
6. Refresh any RELAY tab that was already open.

## Use

1. Ask RELAY AI for a part using a verified machine reference.
2. Select **Search current website** beneath the RELAY response.
3. Open the relevant supplier or manufacturer catalogue page.
4. Open the extension and optionally select **Fill website search**. Review and submit the website's search yourself.
5. Select **Scan current page** after the website displays its results.
6. Review the locally ranked matches that include an extracted part, SKU, MPN, product or catalogue number.
7. Select **Send suggestion to RELAY** for the candidate you want to review.

## Search strategy

- **Takeuchi EPC:** RELAY passes its ranked serial-compatible catalogue numbers to the extension. The website search is filled with the highest-ranked part number, not the model or description. A result is marked verified by the scraper only when the same normalized part number is extracted from the Takeuchi results page.
- **TVH, eBay and other websites:** the search is filled with the machine model and part description. Extracted catalogue numbers remain unverified supplier or marketplace suggestions.
- Takeuchi scraper verification confirms that the suggested number appears on the Takeuchi website. It does not independently prove serial-range fitment, supersession or availability.

## Security and limitations

- Scanning occurs only after the user selects **Scan current page**.
- `activeTab` access is temporary and limited to the selected tab.
- Website cookies, passwords and form values are not sent to RELAY.
- The extension reads rendered visible text; it does not bypass logins, CAPTCHAs or access controls.
- The scan also reads product identifiers exposed in page metadata, JSON-LD and safe `data-*` attributes.
- Website searches are populated but never submitted automatically.
- Text-only matches are retained as supporting evidence but cannot be sent to RELAY as a catalogued part.
- Results are suggestions, not verified fitment.
- Dynamic catalogues may require the user to run the website's own search first so results are visible.
- RELAY and the extension do not automatically place orders or update tickets.
