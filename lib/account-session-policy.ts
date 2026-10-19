const DAILY_SESSION_CUTOFF_HOUR = 4;
const SESSION_SHIFT_MS = DAILY_SESSION_CUTOFF_HOUR * 60 * 60 * 1000;
const ukDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sessionDayKey(value: Date) {
  return ukDayFormatter.format(new Date(value.getTime() - SESSION_SHIFT_MS));
}

export function isDailySessionExpired(lastSignInAt: string | null | undefined, now = new Date()) {
  if (!lastSignInAt) return true;
  const signedInAt = new Date(lastSignInAt);
  if (Number.isNaN(signedInAt.getTime())) return true;
  return sessionDayKey(signedInAt) !== sessionDayKey(now);
}

