/** Daily Challenge date helpers. Dates are 'YYYY-MM-DD' in the configured zone. */

export function challengeDateFor(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant the next challenge day begins (local midnight in `timeZone`). */
export function nextResetAt(now: Date, timeZone: string): Date {
  const today = challengeDateFor(now, timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const midnightUtcGuess = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  // Two passes handle zones whose offset changes around midnight.
  let candidate = midnightUtcGuess - zoneOffsetMs(new Date(midnightUtcGuess), timeZone);
  candidate = midnightUtcGuess - zoneOffsetMs(new Date(candidate), timeZone);
  return new Date(candidate);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
}
