# RELAY Parts Lookup browser extension

The extension transfers a machine and part-search context from RELAY AI to a user-selected supplier or manufacturer webpage. It scans visible page content locally, ranks possible matches, and sends a selected candidate back to RELAY AI as an unverified suggestion.

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
6. Review the locally ranked visible-page matches.
7. Select **Send suggestion to RELAY** for the candidate you want to review.

## Security and limitations

- Scanning occurs only after the user selects **Scan current page**.
- `activeTab` access is temporary and limited to the selected tab.
- Website cookies, passwords and form values are not sent to RELAY.
- The extension reads rendered visible text; it does not bypass logins, CAPTCHAs or access controls.
- Website searches are populated but never submitted automatically.
- Results are suggestions, not verified fitment.
- Dynamic catalogues may require the user to run the website's own search first so results are visible.
- RELAY and the extension do not automatically place orders or update tickets.
