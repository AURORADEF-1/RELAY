# Credential handling

RELAY's GitHub repository is public. Provider secrets belong in Sensitive server-only deployment variables or ignored local environment files. Never put real values in source, sample files, screenshots, issue/PR text, logs or browser-prefixed (`NEXT_PUBLIC_`) variables. Blank sample fields are safe.

Release integrity runs pinned, checksum-verified Gitleaks over fetched Git history, with custom rules for JCB, Manitou/Trackunit, Takeuchi and the fleet database credential. Synthetic canaries verify these rules on every run. All scanner output is redacted. Credential files and public-prefixed server secrets are rejected separately. Do not add secret-containing reports as workflow artifacts.

For local pre-commit protection, install Gitleaks from its official release or Homebrew, then run `git config core.hooksPath .githooks` in this checkout (review an existing hooksPath before replacing it). Alternatively place the verified executable in ignored `.tools/gitleaks`. The hook fails closed if the scanner is missing. Run `node scripts/verify-secret-files.mjs` and `gitleaks git --redact=100 --ignore-gitleaks-allow --config .gitleaks.toml` manually to audit.

GitHub secret scanning and push protection should remain enabled. Custom fleet keys may not match GitHub's provider patterns, so local/CI checks are additional safeguards. CI runs after a push: it blocks release but cannot undo a secret already pushed. Local hooks can be bypassed and are specific to each checkout; no scanner guarantees every credential format.

If a real secret is ever pushed, revoke/rotate it at the provider first and update the deployment securely. Deleting a file or making a repository private does not invalidate copied keys. Coordinate any history rewrite and GitHub cached/PR-reference cleanup; never silently force-push shared history.
