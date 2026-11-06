import { describe, expect, it } from "vitest";
import {
  addDays,
  DAY_MS,
  dayKey,
  formatDate,
  formatDateTime,
  formatDateWithYear,
  formatMonth,
  formatMonthYear,
  monthKey,
  parseDayKey,
  recentDayKeys,
  recentMonthKeys,
  startOfUtcDay,
  startOfUtcMonth,
} from "./dates";

const iso = (date: Date) => date.toISOString();

describe("startOfUtcDay", () => {
  it("drops the time of day", () => {
    expect(iso(startOfUtcDay(new Date("2026-03-09T14:05:33.123Z")))).toBe(
      "2026-03-09T00:00:00.000Z",
    );
  });

  it("buckets by the UTC day, not the day in the writer's time zone", () => {
    // 11:30 PM on March 8 in New York is already March 9 in UTC.
    expect(iso(startOfUtcDay(new Date("2026-03-08T23:30:00-05:00")))).toBe(
      "2026-03-09T00:00:00.000Z",
    );
  });
});

describe("addDays", () => {
  const start = new Date("2026-02-27T12:00:00.000Z");

  it("moves forward across a month boundary", () => {
    expect(iso(addDays(start, 2))).toBe("2026-03-01T12:00:00.000Z");
  });

  it("moves backward with a negative count", () => {
    expect(iso(addDays(start, -27))).toBe("2026-01-31T12:00:00.000Z");
  });

  it("returns a new date and leaves the original alone", () => {
    const next = addDays(start, 0);
    expect(next).not.toBe(start);
    expect(next.getTime()).toBe(start.getTime());
    expect(addDays(start, 1).getTime() - start.getTime()).toBe(DAY_MS);
  });
});

describe("startOfUtcMonth", () => {
  const date = new Date("2026-03-31T23:59:59.999Z");

  it("is the first instant of the date's month by default", () => {
    expect(iso(startOfUtcMonth(date))).toBe("2026-03-01T00:00:00.000Z");
  });

  it("moves by whole months without skipping short ones", () => {
    // A naive "same day last month" from March 31 would land in March again.
    expect(iso(startOfUtcMonth(date, -1))).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(startOfUtcMonth(date, 1))).toBe("2026-04-01T00:00:00.000Z");
  });

  it("crosses year boundaries in both directions", () => {
    expect(iso(startOfUtcMonth(date, -3))).toBe("2025-12-01T00:00:00.000Z");
    expect(iso(startOfUtcMonth(date, 10))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("day and month keys", () => {
  it("writes the UTC day as YYYY-MM-DD", () => {
    expect(dayKey(new Date("2026-03-09T23:59:59.999Z"))).toBe("2026-03-09");
    expect(dayKey(new Date("2026-03-08T23:30:00-05:00"))).toBe("2026-03-09");
  });

  it("writes the UTC month as YYYY-MM", () => {
    expect(monthKey(new Date("2026-03-09T14:05:00.000Z"))).toBe("2026-03");
    expect(monthKey(new Date("2026-03-31T23:30:00-05:00"))).toBe("2026-04");
  });

  it("parses a day key as midnight UTC, the inverse of dayKey", () => {
    expect(iso(parseDayKey("2026-03-09"))).toBe("2026-03-09T00:00:00.000Z");
    expect(dayKey(parseDayKey("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("recentDayKeys", () => {
  it("lists the trailing days ending today, oldest first", () => {
    expect(recentDayKeys(new Date("2026-03-02T08:00:00.000Z"), 4)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("is just today for a count of one, and empty for zero", () => {
    const now = new Date("2026-03-02T23:59:59.000Z");
    expect(recentDayKeys(now, 1)).toEqual(["2026-03-02"]);
    expect(recentDayKeys(now, 0)).toEqual([]);
  });
});

describe("recentMonthKeys", () => {
  it("lists the trailing months ending with the current one, oldest first", () => {
    expect(recentMonthKeys(new Date("2026-02-15T00:00:00.000Z"), 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("does not repeat or skip a month on the 31st", () => {
    expect(recentMonthKeys(new Date("2026-03-31T12:00:00.000Z"), 3)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("formatting", () => {
  it("formats a day key, an ISO timestamp and a Date the same way", () => {
    expect(formatDate("2026-03-09")).toBe("Mar 9");
    expect(formatDate("2026-03-09T14:05:00.000Z")).toBe("Mar 9");
    expect(formatDate(new Date("2026-03-09T14:05:00.000Z"))).toBe("Mar 9");
  });

  it("shows the UTC day even when the local day differs", () => {
    expect(formatDate("2026-03-09T00:30:00.000Z")).toBe("Mar 9");
    expect(formatDate("2026-03-09T23:30:00.000Z")).toBe("Mar 9");
  });

  it("adds the year on request", () => {
    expect(formatDateWithYear("2026-03-09")).toBe("Mar 9, 2026");
    expect(formatDateWithYear(new Date("2025-12-31T23:59:59.000Z"))).toBe(
      "Dec 31, 2025",
    );
  });

  it("formats a timestamp with its time and zone", () => {
    // Recent ICU versions put a narrow no-break space before "PM".
    expect(formatDateTime("2026-03-09T14:05:00.000Z")).toMatch(
      /^Mar 9, 2026, 2:05\sPM UTC$/u,
    );
    expect(formatDateTime(new Date("2026-03-09T00:00:00.000Z"))).toMatch(
      /^Mar 9, 2026, 12:00\sAM UTC$/u,
    );
  });

  it("formats month keys in short and long form", () => {
    expect(formatMonth("2026-03")).toBe("Mar");
    expect(formatMonth("2025-12")).toBe("Dec");
    expect(formatMonthYear("2026-03")).toBe("March 2026");
    expect(formatMonthYear("2025-12")).toBe("December 2025");
  });
});
