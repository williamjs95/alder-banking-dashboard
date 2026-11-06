import { describe, expect, it } from "vitest";
import { ids } from "../../test/fixtures";
import {
  clearedFilters,
  currentSort,
  FILTER_KEYS,
  hasActiveFilters,
  readFilters,
  splitList,
  toggleSort,
  type FilterKey,
  type RawFilters,
} from "./transaction-filters";

/** Reads filters the way the client does: from a URL's search params. */
const fromUrl = (search: string) => {
  const params = new URLSearchParams(search);
  return readFilters((key) => params.get(key));
};

describe("readFilters", () => {
  it("is empty for a URL with no parameters", () => {
    expect(fromUrl("")).toEqual({});
  });

  it("keeps every valid filter as the string it arrived as", () => {
    const search =
      `?q=stripe&accountId=${ids.checking}&cardId=${ids.cardCloud}` +
      "&category=payroll,taxes&status=posted&direction=out" +
      "&from=2026-06-01&to=2026-06-30&minCents=1000&maxCents=500000" +
      "&sort=amount&order=asc&page=3&pageSize=50";

    expect(fromUrl(search)).toEqual({
      q: "stripe",
      accountId: ids.checking,
      cardId: ids.cardCloud,
      category: "payroll,taxes",
      status: "posted",
      direction: "out",
      from: "2026-06-01",
      to: "2026-06-30",
      minCents: "1000",
      maxCents: "500000",
      sort: "amount",
      order: "asc",
      page: "3",
      pageSize: "50",
    });
  });

  it("ignores parameters that are not filters", () => {
    expect(fromUrl(`?tx=${ids.txStripe}&utm_source=email&q=aws`)).toEqual({
      q: "aws",
    });
  });

  it("drops empty values", () => {
    expect(fromUrl("?q=&status=&page=2")).toEqual({ page: "2" });
  });

  it("accepts a getter that returns undefined for missing keys", () => {
    const source: Partial<Record<FilterKey, string>> = { status: "failed" };
    expect(readFilters((key) => source[key])).toEqual({ status: "failed" });
  });

  it("drops each invalid value and keeps the valid ones around it", () => {
    expect(
      fromUrl(
        "?q=aws&accountId=nope&category=payroll,groceries&status=pending" +
          "&direction=sideways&from=yesterday&minCents=-5&sort=size" +
          "&order=desc&page=0&pageSize=20",
      ),
    ).toEqual({ q: "aws", status: "pending", order: "desc" });
  });

  it("drops a value once even when it fails more than one rule", () => {
    // 2.5 is neither a whole number nor on the page size whitelist.
    expect(fromUrl("?pageSize=2.5&page=2")).toEqual({ page: "2" });
  });

  it("asks only for the known filter keys, in order", () => {
    const asked: string[] = [];
    readFilters((key) => {
      asked.push(key);
      return null;
    });
    expect(asked).toEqual([...FILTER_KEYS]);
  });
});

describe("hasActiveFilters", () => {
  it("is false with no filters at all", () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it("is false when only sorting and paging are set", () => {
    expect(
      hasActiveFilters({
        sort: "amount",
        order: "asc",
        page: "2",
        pageSize: "50",
      }),
    ).toBe(false);
  });

  it.each<[FilterKey, string]>([
    ["q", "aws"],
    ["accountId", ids.checking],
    ["cardId", ids.cardCloud],
    ["category", "cloud"],
    ["status", "failed"],
    ["direction", "in"],
    ["from", "2026-06-01"],
    ["to", "2026-06-30"],
    ["minCents", "100"],
    ["maxCents", "900"],
  ])("is true when %s narrows the results", (key, value) => {
    expect(hasActiveFilters({ [key]: value })).toBe(true);
  });
});

describe("clearedFilters", () => {
  const filters: RawFilters = {
    q: "aws",
    accountId: ids.checking,
    cardId: ids.cardCloud,
    category: "cloud",
    status: "posted",
    direction: "out",
    from: "2026-06-01",
    to: "2026-06-30",
    minCents: "100",
    maxCents: "900",
    sort: "amount",
    order: "asc",
    page: "4",
    pageSize: "50",
  };

  it("removes what narrows the results and goes back to the first page", () => {
    expect(clearedFilters(filters)).toEqual({
      sort: "amount",
      order: "asc",
      pageSize: "50",
    });
  });

  it("returns a copy and leaves the original untouched", () => {
    const before = { ...filters };
    const cleared = clearedFilters(filters);
    expect(cleared).not.toBe(filters);
    expect(filters).toEqual(before);
    expect(hasActiveFilters(cleared)).toBe(false);
  });

  it("is empty for empty filters", () => {
    expect(clearedFilters({})).toEqual({});
  });
});

describe("splitList", () => {
  it("is empty for a missing or empty value", () => {
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("")).toEqual([]);
  });

  it("splits on commas and skips empty segments", () => {
    expect(splitList("payroll")).toEqual(["payroll"]);
    expect(splitList("payroll,taxes")).toEqual(["payroll", "taxes"]);
    expect(splitList(",payroll,,taxes,")).toEqual(["payroll", "taxes"]);
  });
});

describe("currentSort", () => {
  it("is newest first when the URL says nothing", () => {
    expect(currentSort({})).toEqual({ sort: "date", order: "desc" });
  });

  it("reads the sort and order from the filters", () => {
    expect(currentSort({ sort: "amount", order: "asc" })).toEqual({
      sort: "amount",
      order: "asc",
    });
  });

  it("matches the server's default of descending when only the field is given", () => {
    expect(currentSort({ sort: "description" })).toEqual({
      sort: "description",
      order: "desc",
    });
    expect(currentSort({ order: "asc" })).toEqual({
      sort: "date",
      order: "asc",
    });
  });
});

describe("toggleSort", () => {
  it("switches to a new column in that column's natural direction", () => {
    expect(toggleSort({}, "amount")).toEqual({ sort: "amount", order: "desc" });
    expect(toggleSort({}, "description")).toEqual({
      sort: "description",
      order: "asc",
    });
    expect(toggleSort({ sort: "amount", order: "asc" }, "date")).toEqual({
      sort: "date",
      order: "desc",
    });
  });

  it("flips the direction when the column is already active", () => {
    expect(toggleSort({ sort: "amount", order: "desc" }, "amount")).toEqual({
      sort: "amount",
      order: "asc",
    });
    expect(toggleSort({ sort: "amount", order: "asc" }, "amount")).toEqual({
      sort: "amount",
      order: "desc",
    });
  });

  it("treats date as active when no sort is set, so the first click flips it", () => {
    expect(toggleSort({}, "date")).toEqual({ sort: "date", order: "asc" });
  });
});
