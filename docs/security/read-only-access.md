# Read-only testing accounts

The private `relay_access.read_only_accounts` table is the database authority.
Only a trusted database administrator can enrol or remove accounts. Keep the
server-controlled Auth `app_metadata.relay_read_only` flag synchronized with it:
the server flag prevents API handlers from writing through service credentials.

Deploy the server authorization guard before enrolling an account. Enrol with
one transaction that inserts its Auth UUID into the private table and merges
`{"relay_read_only": true}` into `auth.users.raw_app_meta_data`. Do not change
the user's password, email, or profile role. Existing sessions are restricted
without waiting for JWT refresh. Removing the restriction requires deleting the
private table entry and removing that app metadata field in one transaction.

Enrolled accounts retain their existing row visibility. No additional SELECT
permissions are granted. The Data API denies non-GET/HEAD requests, including
POST RPC calls; GET/HEAD run in PostgREST read-only transactions. Statement
triggers also reject writes under the user's identity, including through
SECURITY DEFINER routines. Storage RLS rejects object inserts, updates and deletes.
The app checks fresh Auth metadata and denies non-read server requests before
any service-role work. Authentication itself remains available, including normal
Auth session maintenance and personal credential changes.

This is a testing restriction, not a redesigned viewer interface. Edit buttons,
presence writes and POST-based searches/RPCs can fail for these accounts. GET
integration reads may still populate shared provider caches as normal; the
account cannot edit business records or trigger collection through POST routes.

New public tables must also install the `relay_read_only_write_guard` statement
trigger. The Data API guard covers future tables immediately, but callable
functions and any new API routes still require review. Never give a testing
account service-role keys or shared platform-owner credentials: those represent
a different privileged identity and are outside these per-user restrictions.

Before replacing `pgrst.db_pre_request`, compose this check with any existing
hook. The migration fails if it detects another configured hook.

Validation should impersonate an enrolled UUID with the authenticated role,
verify existing reads and denied INSERT/UPDATE/DELETE and mutating RPCs, check
storage policies, and confirm ordinary accounts and scheduled workers still
work. Use rollback-only transactions for database write tests.
