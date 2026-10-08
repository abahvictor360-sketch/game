/** Injectable clock so deadline logic can be tested precisely. */
let override: (() => Date) | null = null;

export const clock = {
  now(): Date {
    return override ? override() : new Date();
  },
};

export function setClockForTesting(fn: (() => Date) | null) {
  override = fn;
}
