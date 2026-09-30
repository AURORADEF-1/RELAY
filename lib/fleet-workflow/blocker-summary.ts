/** Presentation only: preserve individual blockers for clearance and override validation. */
export function summariseBlockers(blockers: readonly string[]): string[] {
 const groups = [
  ['Fault requires review: ', 'fault report', 'require review'],
  ['Open parts request: ', 'open parts request', ''],
  ['Open workshop job: ', 'open workshop job', ''],
 ] as const;
 const result: string[] = [];
 const seen = new Set<string>();
 for (const blocker of blockers) {
  const group = groups.find(([prefix]) => blocker.startsWith(prefix));
  if (!group) { result.push(blocker); continue; }
  const [prefix, label, suffix] = group;
  if (seen.has(prefix)) continue;
  seen.add(prefix);
  const count = blockers.filter(item => item.startsWith(prefix)).length;
  result.push(`${count.toLocaleString('en-GB')} ${label}${count === 1 ? '' : 's'}${suffix ? count === 1 ? ' requires review' : ' ' + suffix : ''}`);
 }
 return result;
}
