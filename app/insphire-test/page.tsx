'use client';

import Link from 'next/link';
import {FormEvent, useState} from 'react';
import {AuthGuard} from '@/components/auth-guard';
import {getSupabaseAccessToken} from '@/lib/supabase';

type Job = {jobNumber: string; fleetNumber: string | null; status: number; jobDate: string | null};
type Result = {
  database: string;
  checkedAt: string;
  dataFreshness: string;
  data: {jobs?: Job[]; hasMore?: boolean; connected?: boolean};
};

function formatDate(value: string | null) {
  if (!value) return 'Not supplied';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}).format(date);
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function ConnectionIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 12h8M12 8v8" /><circle cx="12" cy="12" r="9" /></svg>;
}

export default function InspHireTestPage() {
  const [job, setJob] = useState('');
  const [asset, setAsset] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function run(kind: 'health' | 'workshop-jobs') {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error('Sign in with a RELAY admin account.');
      const params = new URLSearchParams();
      if (kind === 'workshop-jobs') {
        if (!job.trim() && !asset.trim()) throw new Error('Enter an exact job number or asset reference.');
        if (job.trim()) params.set('jobNumber', job.trim());
        if (asset.trim()) params.set('fleetNumber', asset.trim());
        params.set('limit', '25');
      }
      const response = await fetch(`/api/integrations/insphire-test/${kind}?${params}`, {
        headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The test connector is unavailable.');
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read the test connector.');
    } finally {
      setBusy(false);
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('workshop-jobs');
  }

  const jobs = result?.data.jobs;
  return (
    <AuthGuard requiredRole="admin">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 text-[color:var(--foreground)] sm:px-6 sm:py-10">
        <Link href="/console" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground-muted)] hover:text-[color:var(--brand-primary)]">
          <span aria-hidden="true">←</span> Back to Console
        </Link>

        <header className="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--brand-primary-strong)]">Read-Only Pilot</span>
              <span className="font-mono text-xs font-semibold text-[color:var(--foreground-subtle)]">iHTEST_MLP</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[color:var(--foreground-strong)] sm:text-4xl">InspHire Test Lookup</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--foreground-muted)] sm:text-base">Search the historical test copy without importing or updating data in RELAY or InspHire.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--success)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--success)] shadow-[0_0_0_4px_var(--success-soft)]" /> Read-only connection
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-panel)] shadow-[var(--shadow-panel)]">
          <div className="border-b border-[color:var(--border)] bg-[color:var(--background-muted)] px-5 py-4 sm:px-6">
            <h2 className="font-bold text-[color:var(--foreground-strong)]">Find a test job</h2>
            <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">Use either field, or enter both to require an exact match.</p>
          </div>
          <form onSubmit={submitLookup} className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[color:var(--foreground)]">
                InspHire Job Number
                <span className="mt-1 block text-xs font-normal text-[color:var(--foreground-subtle)]">Keep any leading zeros</span>
                <input value={job} onChange={(event) => setJob(event.target.value)} maxLength={32} inputMode="numeric" placeholder="e.g. 0000041076" className="mt-2 block min-h-12 w-full rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--background-field)] px-4 py-3 font-mono text-[color:var(--foreground-strong)] placeholder:text-[color:var(--foreground-subtle)]" />
              </label>
              <label className="text-sm font-semibold text-[color:var(--foreground)]">
                Asset Reference
                <span className="mt-1 block text-xs font-normal text-[color:var(--foreground-subtle)]">Exact fleet or asset reference</span>
                <input value={asset} onChange={(event) => setAsset(event.target.value)} maxLength={32} placeholder="e.g. 12676" className="mt-2 block min-h-12 w-full rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--background-field)] px-4 py-3 font-mono text-[color:var(--foreground-strong)] placeholder:text-[color:var(--foreground-subtle)]" />
              </label>
            </div>
            <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-[color:var(--foreground-subtle)]">Up to 25 exact matches per lookup.</p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button disabled={busy} type="button" onClick={() => void run('health')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--background-panel-strong)] px-4 py-2.5 text-sm font-bold text-[color:var(--foreground)] hover:bg-[color:var(--background-muted)] disabled:opacity-50">
                  <span className="h-4 w-4"><ConnectionIcon /></span> Check Connection
                </button>
                <button disabled={busy} type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-5 py-2.5 text-sm font-bold text-[color:var(--accent-foreground)] shadow-[0_12px_28px_-16px_var(--accent)] hover:bg-[color:var(--brand-primary-strong)] disabled:opacity-50">
                  <span className="h-4 w-4"><SearchIcon /></span> {busy ? 'Checking…' : 'Look Up Jobs'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="mt-4 flex gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--warning-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--foreground-muted)]">
          <span aria-hidden="true" className="font-bold text-[color:var(--warning)]">i</span>
          <p>Asset references link to RELAY machines only after admin review. Source status codes are not RELAY statuses.</p>
        </aside>

        {error && <p role="alert" className="mt-6 rounded-xl border border-[color:var(--danger)] bg-[color:var(--danger-soft)] p-4 text-sm font-semibold text-[color:var(--danger)]">{error}</p>}

        {result && (
          <section aria-live="polite" className="mt-8 space-y-4">
            {result.data.connected && (
              <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--success-soft)] p-4 text-sm font-semibold text-[color:var(--success)]">
                <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--success)] text-white">✓</span> Test connection and read-only permissions verified.
              </div>
            )}
            {jobs && (
              <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-panel)] shadow-[var(--shadow-soft)]">
                <div className="flex flex-col gap-2 border-b border-[color:var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <h2 className="font-bold text-[color:var(--foreground-strong)]">Lookup Results</h2>
                    <p className="mt-1 text-xs text-[color:var(--foreground-subtle)]">Historical test copy · {result.database} · Checked {new Date(result.checkedAt).toLocaleString('en-GB')}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-bold text-[color:var(--brand-primary-strong)]">{jobs.length} {jobs.length === 1 ? 'match' : 'matches'}</span>
                </div>
                {jobs.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="bg-[color:var(--background-muted)] text-xs uppercase tracking-[0.08em] text-[color:var(--foreground-subtle)]">
                        <tr>{['Job Number', 'Asset Reference', 'Source Status', 'Job Date'].map((label) => <th key={label} className="px-6 py-3 font-bold">{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {jobs.map((row) => (
                          <tr key={row.jobNumber} className="border-t border-[color:var(--border)] hover:bg-[color:var(--accent-soft)]">
                            <td className="px-6 py-4 font-mono font-bold text-[color:var(--brand-primary-strong)]">{row.jobNumber}</td>
                            <td className="px-6 py-4 font-mono text-[color:var(--foreground-strong)]">{row.fleetNumber || '—'}</td>
                            <td className="px-6 py-4"><span className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--background-field)] px-2.5 py-1 font-mono text-xs font-bold text-[color:var(--foreground)]">Code {row.status}</span></td>
                            <td className="px-6 py-4 text-[color:var(--foreground)]">{formatDate(row.jobDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-6 py-12 text-center"><p className="font-bold text-[color:var(--foreground-strong)]">No matching jobs</p><p className="mt-1 text-sm text-[color:var(--foreground-muted)]">Check the exact job number or asset reference and try again.</p></div>
                )}
                <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--foreground-subtle)] sm:px-6">{result.dataFreshness}. Query time does not indicate when the test copy was refreshed.</div>
              </div>
            )}
            {result.data.hasMore && <p className="rounded-xl bg-[color:var(--warning-soft)] p-4 text-sm font-semibold text-[color:var(--warning)]">More results exist. Refine the exact lookup; this page shows only the first 25.</p>}
          </section>
        )}
      </main>
    </AuthGuard>
  );
}
