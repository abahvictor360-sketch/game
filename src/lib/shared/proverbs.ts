/**
 * Proverbs shown on the results screen. Origins of many African proverbs are
 * shared across peoples and hard to pin down, so they are credited simply as
 * "African proverb" rather than to a single people or country.
 */
export const PROVERBS = [
  'Wisdom is like a baobab tree: no one person can embrace it.',
  'However long the night, the dawn will break.',
  'Knowledge is like a garden: if it is not cultivated, it cannot be harvested.',
  'If you want to go fast, go alone. If you want to go far, go together.',
  'He who learns, teaches.',
  'Until the lion learns to write, tales of the hunt will always glorify the hunter.',
  'When the music changes, so does the dance.',
  'Rain does not fall on one roof alone.',
  'A roaring lion kills no game.',
  'Little by little, a little becomes a lot.',
] as const;

/** Stable pick for a given id, so a result always shows the same proverb. */
export function proverbFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PROVERBS[h % PROVERBS.length];
}
