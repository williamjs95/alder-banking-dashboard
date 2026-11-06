/**
 * Date helpers. The ledger buckets by UTC day and month so the server and
 * every client agree on which day a transaction belongs to.
 */

export const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** First instant of the UTC month `offset` months away from `date`'s month. */
export function startOfUtcMonth(date: Date, offset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1),
  );
}

/** "2026-03-09" */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-03" */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Parses "YYYY-MM-DD" as midnight UTC. */
export function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** The last `count` day keys ending today, oldest first. */
export function recentDayKeys(now: Date, count: number): string[] {
  const today = startOfUtcDay(now);
  return Array.from({ length: count }, (_, index) =>
    dayKey(addDays(today, index - (count - 1))),
  );
}

/** The last `count` month keys ending with the current month, oldest first. */
export function recentMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    monthKey(startOfUtcMonth(now, index - (count - 1))),
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DATE_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type DateInput = Date | string;
const toDate = (value: DateInput) =>
  typeof value === "string"
    ? new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
    : value;

/** "Mar 9" */
export const formatDate = (value: DateInput) =>
  DATE_FORMAT.format(toDate(value));

/** "Mar 9, 2026" */
export const formatDateWithYear = (value: DateInput) =>
  DATE_YEAR_FORMAT.format(toDate(value));

/** "Mar 9, 2026, 2:05 PM UTC" */
export const formatDateTime = (value: DateInput) =>
  DATE_TIME_FORMAT.format(toDate(value));

/** "Mar" from a "YYYY-MM" key. */
export const formatMonth = (key: string) =>
  MONTH_FORMAT.format(new Date(`${key}-01T00:00:00.000Z`));

/** "March 2026" from a "YYYY-MM" key. */
export const formatMonthYear = (key: string) =>
  MONTH_YEAR_FORMAT.format(new Date(`${key}-01T00:00:00.000Z`));
